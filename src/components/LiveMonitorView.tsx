import {useCallback, useEffect, useRef, useState, type ChangeEvent} from 'react';
import {
  Camera,
  CameraOff,
  CheckCircle2,
  Clock,
  ScanFace,
  ShieldAlert,
  SlidersHorizontal,
  Upload,
} from 'lucide-react';
import {
  api,
  type RecognitionResponse,
  type RegisteredUser,
  type ReportsSummary,
  type SystemSettings,
} from '../lib/api.ts';
import {
  detectFaces,
  extractFaceEncoding128,
  type FaceBox,
} from '../lib/faceEngine.ts';
import {AvatarThumb} from './AvatarThumb.tsx';

interface LiveMonitorViewProps {
  users: RegisteredUser[];
  settings: SystemSettings;
  summary: ReportsSummary | null;
  onSettingsUpdated: (next: SystemSettings) => void;
  onAttendanceLogged: () => void;
}

interface ScanEvent {
  id: string;
  timestamp: string;
  status: 'marked' | 'duplicate' | 'unknown';
  name: string;
  rollNo: string;
  department: string;
  confidence: number;
  distance: number | null;
  avatarUrl: string | null;
}

const UNKNOWN_SAMPLE_URL = '/src/assets/images/test_unknown_visitor_1795535021733.jpg';

export function LiveMonitorView({
  users,
  settings,
  summary,
  onSettingsUpdated,
  onAttendanceLogged,
}: LiveMonitorViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const isScanningRef = useRef(false);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<RecognitionResponse | null>(null);
  const [scanHistory, setScanHistory] = useState<ScanEvent[]>([]);
  const [localThreshold, setLocalThreshold] = useState(settings.match_threshold);
  const [savingSettings, setSavingSettings] = useState(false);
  const [processingFrame, setProcessingFrame] = useState(false);

  useEffect(() => {
    setLocalThreshold(settings.match_threshold);
  }, [settings.match_threshold]);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    const overlay = overlayRef.current;
    if (overlay) {
      const ctx = overlay.getContext('2d');
      ctx?.clearRect(0, 0, overlay.width, overlay.height);
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const drawDetectionOverlay = useCallback(
    (
      srcW: number,
      srcH: number,
      box: FaceBox | null,
      result: RecognitionResponse | null,
    ) => {
      const canvas = overlayRef.current;
      if (!canvas) return;
      canvas.width = srcW;
      canvas.height = srcH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, srcW, srcH);

      if (!box) return;

      const color =
        result?.status === 'marked'
          ? '#16A34A'
          : result?.status === 'duplicate'
            ? '#D97706'
            : '#DC2626';

      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(2, Math.round(srcW / 240));
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      const labelText =
        result?.matched && result.user
          ? `${result.user.name} · ${(result.confidence * 100).toFixed(1)}%`
          : 'Unknown — Not Registered';

      const subText =
        result?.status === 'marked'
          ? 'Attendance Logged'
          : result?.status === 'duplicate'
            ? 'Duplicate Blocked'
            : 'No Attendance Recorded';

      ctx.font = '600 14px "Plus Jakarta Sans", sans-serif';
      const textWidth = Math.max(
        ctx.measureText(labelText).width,
        ctx.measureText(subText).width,
      );
      const boxW = Math.max(box.width, textWidth + 20);
      const barH = 44;
      const barY = Math.min(srcH - barH, box.y + box.height);

      ctx.fillStyle = color;
      ctx.fillRect(box.x, barY, boxW, barH);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(labelText, box.x + 10, barY + 18);
      ctx.font = '500 12px "Public Sans", sans-serif';
      ctx.fillText(subText, box.x + 10, barY + 36);
    },
    [],
  );

  const pushScanEvent = useCallback((res: RecognitionResponse) => {
    const nowTime = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    const event: ScanEvent = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: nowTime,
      status: res.status,
      name: res.user?.name || 'Unknown Subject',
      rollNo: res.user?.roll_no || 'Unregistered',
      department: res.user?.department_name || 'Unverified',
      confidence: res.confidence,
      distance: res.distance,
      avatarUrl: res.user?.avatar_url || null,
    };
    setScanHistory((prev) => [event, ...prev].slice(0, 12));
  }, []);

  const analyzeSource = useCallback(
    async (source: HTMLVideoElement | HTMLImageElement, srcW: number, srcH: number) => {
      if (isScanningRef.current) return;
      isScanningRef.current = true;
      setProcessingFrame(true);

      try {
        const faces = await detectFaces(source);
        if (faces.length === 0) {
          drawDetectionOverlay(srcW, srcH, null, null);
          return;
        }
        const primaryBox = faces[0];
        const encoding = extractFaceEncoding128(source, primaryBox);
        const result = await api.recognizeFace(encoding, localThreshold);
        setLatestResult(result);
        drawDetectionOverlay(srcW, srcH, primaryBox, result);
        pushScanEvent(result);
        if (result.status === 'marked') {
          onAttendanceLogged();
        }
      } catch (err) {
        console.error('Frame recognition failed:', err);
      } finally {
        isScanningRef.current = false;
        setProcessingFrame(false);
      }
    },
    [drawDetectionOverlay, localThreshold, onAttendanceLogged, pushScanEvent],
  );

  const startCamera = async () => {
    setCameraError(null);
    setPreviewImageUrl(null);
    setLatestResult(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera API is unavailable in this browser context. Use a sample portrait or upload an image below.',
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: {ideal: 960},
          height: {ideal: 720},
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      scanTimerRef.current = window.setInterval(() => {
        const video = videoRef.current;
        if (video && video.readyState >= 2 && video.videoWidth > 0) {
          void analyzeSource(video, video.videoWidth, video.videoHeight);
        }
      }, 1400);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Camera access denied or unavailable (${err.message}). You can still test recognition using uploaded images or sample frames below.`
          : 'Unable to open webcam.',
      );
    }
  };

  const scanStaticImage = (url: string) => {
    stopCamera();
    setCameraError(null);
    setPreviewImageUrl(url);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      void analyzeSource(img, img.naturalWidth, img.naturalHeight);
    };
    img.src = url;
  };

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        scanStaticImage(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSaveSettings = async (patch: Partial<SystemSettings>) => {
    setSavingSettings(true);
    try {
      const res = await api.updateSettings(patch);
      onSettingsUpdated(res.settings);
    } catch (err) {
      console.error('Failed to update settings:', err);
    } finally {
      setSavingSettings(false);
    }
  };

  const todayStats = summary?.today ?? {
    total_members: users.length,
    present: 0,
    late: 0,
    checked_in: 0,
    absent: users.length,
    attendance_pct: 0,
  };

  return (
    <div className="space-y-6">
      {/* Full-width KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 bg-white border border-slate-200 rounded-xl divide-y lg:divide-y-0 lg:divide-x divide-slate-200">
        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Checked In Today</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums font-display">
            {todayStats.checked_in}{' '}
            <span className="text-sm font-normal text-slate-500">
              / {todayStats.total_members}
            </span>
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            {todayStats.attendance_pct}% daily turnout
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">On-Time Present</p>
          <p className="mt-1.5 text-2xl font-semibold text-emerald-700 tabular-nums font-display">
            {todayStats.present}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            Before {settings.late_after_time.slice(0, 5)} cutoff
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Late Arrivals</p>
          <p className="mt-1.5 text-2xl font-semibold text-amber-700 tabular-nums font-display">
            {todayStats.late}
          </p>
          <p className="mt-1 text-xs text-slate-500 tabular-nums">
            After {settings.late_after_time.slice(0, 5)} cutoff
          </p>
        </div>

        <div className="p-5">
          <p className="text-xs font-medium text-slate-500">Not Yet Checked In</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-900 tabular-nums font-display">
            {todayStats.absent}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {settings.duplicate_mode === 'same_day'
              ? '1 entry per day limit'
              : `${settings.duplicate_window_minutes}m duplicate cooldown`}
          </p>
        </div>
      </div>

      {/* Main 2-Column Recognition Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Camera & Verification Viewport */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                Contactless Recognition Feed
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Detects faces, extracts 128-d feature vectors, and verifies against registered profiles
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {!cameraActive ? (
                <button
                  type="button"
                  onClick={startCamera}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3.5 py-2 text-xs font-medium text-white hover:bg-blue-800 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Camera className="h-4 w-4" />
                  Start Camera
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopCamera}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
                >
                  <CameraOff className="h-4 w-4" />
                  Stop Camera
                </button>
              )}

              <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
                <Upload className="h-4 w-4" />
                Test Photo
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="sr-only"
                />
              </label>
            </div>
          </div>

          {cameraError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-900">
              {cameraError}
            </div>
          )}

          {/* Video / Image Viewport */}
          <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`h-full w-full object-contain ${cameraActive ? 'block' : 'hidden'}`}
            />

            {!cameraActive && previewImageUrl && (
              <img
                src={previewImageUrl}
                alt="Recognition frame preview"
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            )}

            {!cameraActive && !previewImageUrl && (
              <div className="text-center px-6 py-10 max-w-sm">
                <ScanFace className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-100">
                  Camera Feed Standby
                </p>
                <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                  Click Start Camera to run continuous live webcam attendance, or select a sample portrait below to test matching and duplicate prevention.
                </p>
              </div>
            )}

            <canvas
              ref={overlayRef}
              className="pointer-events-none absolute inset-0 h-full w-full object-contain"
            />
          </div>

          {/* Latest Verification Banner */}
          {latestResult && (
            <div
              className={`rounded-lg border px-4 py-3 flex items-center justify-between gap-4 ${
                latestResult.status === 'marked'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-950'
                  : latestResult.status === 'duplicate'
                    ? 'border-amber-200 bg-amber-50 text-amber-950'
                    : 'border-red-200 bg-red-50 text-red-950'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {latestResult.status === 'marked' ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-700 shrink-0" />
                ) : latestResult.status === 'duplicate' ? (
                  <Clock className="h-5 w-5 text-amber-700 shrink-0" />
                ) : (
                  <ShieldAlert className="h-5 w-5 text-red-700 shrink-0" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {latestResult.matched && latestResult.user
                      ? `${latestResult.user.name} (${latestResult.user.roll_no})`
                      : 'Unknown Face Detected'}
                  </p>
                  <p className="text-xs opacity-85 truncate">
                    {latestResult.status === 'marked' && latestResult.record
                      ? `Attendance marked as ${latestResult.record.status} at ${latestResult.record.time_in}`
                      : latestResult.status === 'duplicate' && latestResult.record
                        ? `Duplicate prevented — already checked in at ${latestResult.record.time_in}`
                        : `Distance ${latestResult.distance ?? 'N/A'} exceeds threshold ${latestResult.threshold} — attendance not logged`}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0 tabular-nums font-mono text-xs">
                {latestResult.matched ? (
                  <span className="font-semibold">
                    {(latestResult.confidence * 100).toFixed(1)}% match
                  </span>
                ) : (
                  <span className="font-semibold">Rejected</span>
                )}
                {latestResult.distance !== null && (
                  <div className="opacity-75">d={latestResult.distance.toFixed(3)}</div>
                )}
              </div>
            </div>
          )}

          {/* Quick Verification Sample Strip */}
          <div className="pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-xs font-medium text-slate-600">
                Quick Verification Samples (Click to scan frame)
              </span>
              {processingFrame && (
                <span className="text-xs text-blue-700 font-medium">Processing...</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {users
                .filter((u) => Boolean(u.avatar_url))
                .slice(0, 4)
                .map((member) => (
                  <button
                    key={member.user_id}
                    type="button"
                    onClick={() => member.avatar_url && scanStaticImage(member.avatar_url)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-blue-600 hover:bg-blue-50/50 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <AvatarThumb src={member.avatar_url} name={member.name} size="sm" />
                    <span>{member.name}</span>
                  </button>
                ))}
              <button
                type="button"
                onClick={() => scanStaticImage(UNKNOWN_SAMPLE_URL)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-red-500 hover:bg-red-50/50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <AvatarThumb src={UNKNOWN_SAMPLE_URL} name="Unknown Visitor" size="sm" />
                <span>Unregistered Visitor</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right: Threshold Configuration & Live Activity */}
        <div className="lg:col-span-5 space-y-6">
          {/* Recognition Policy Controls */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-slate-600" />
                <h2 className="text-base font-semibold text-slate-900">
                  Matching & Duplicate Policy
                </h2>
              </div>
              {savingSettings && (
                <span className="text-xs text-slate-500">Saving...</span>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="threshold-range" className="font-medium text-slate-700">
                  Euclidean Distance Threshold
                </label>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {localThreshold.toFixed(2)}
                </span>
              </div>
              <input
                id="threshold-range"
                type="range"
                min={0.35}
                max={0.75}
                step={0.01}
                value={localThreshold}
                onChange={(e) => setLocalThreshold(Number(e.target.value))}
                onMouseUp={() =>
                  void handleSaveSettings({match_threshold: localThreshold})
                }
                onTouchEnd={() =>
                  void handleSaveSettings({match_threshold: localThreshold})
                }
                className="w-full accent-blue-700 cursor-pointer"
              />
              <div className="flex justify-between text-[11px] text-slate-500 mt-1">
                <span>0.35 (Stricter)</span>
                <span>0.55 (Balanced)</span>
                <span>0.75 (Lenient)</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
              <div>
                <label
                  htmlFor="dup-mode"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Duplicate Prevention
                </label>
                <select
                  id="dup-mode"
                  value={settings.duplicate_mode}
                  onChange={(e) =>
                    void handleSaveSettings({
                      duplicate_mode: e.target.value as 'window' | 'same_day',
                    })
                  }
                  className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                >
                  <option value="window">Cooldown Window</option>
                  <option value="same_day">Once Per Day</option>
                </select>
              </div>

              {settings.duplicate_mode === 'window' ? (
                <div>
                  <label
                    htmlFor="dup-minutes"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Cooldown Minutes
                  </label>
                  <select
                    id="dup-minutes"
                    value={settings.duplicate_window_minutes}
                    onChange={(e) =>
                      void handleSaveSettings({
                        duplicate_window_minutes: Number(e.target.value),
                      })
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none tabular-nums"
                  >
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                </div>
              ) : (
                <div>
                  <label
                    htmlFor="late-cutoff"
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    Late Arrival Cutoff
                  </label>
                  <input
                    id="late-cutoff"
                    type="time"
                    value={settings.late_after_time.slice(0, 5)}
                    onChange={(e) =>
                      void handleSaveSettings({late_after_time: e.target.value})
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none tabular-nums"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Live Recognition Event Stream */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold text-slate-900">
                Session Scan Events
              </h2>
              <span className="text-xs text-slate-500 tabular-nums">
                {scanHistory.length} recent
              </span>
            </div>

            {scanHistory.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-700">
                  No scans captured in this session
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Start the camera or select a sample portrait to see live matching results.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {scanHistory.map((item) => (
                  <div
                    key={item.id}
                    className="py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarThumb src={item.avatarUrl} name={item.name} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {item.name}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {item.rollNo} · {item.department}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-xs font-medium ${
                          item.status === 'marked'
                            ? 'text-emerald-700'
                            : item.status === 'duplicate'
                              ? 'text-amber-700'
                              : 'text-red-700'
                        }`}
                      >
                        {item.status === 'marked'
                          ? 'Logged'
                          : item.status === 'duplicate'
                            ? 'Duplicate'
                            : 'Unknown'}
                      </p>
                      <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                        {item.timestamp}
                        {item.confidence > 0 ? ` · ${(item.confidence * 100).toFixed(0)}%` : ''}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
