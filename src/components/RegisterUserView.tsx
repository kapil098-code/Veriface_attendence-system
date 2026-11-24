import {useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent} from 'react';
import {Camera, CameraOff, Check, RotateCcw, Upload, UserPlus} from 'lucide-react';
import {api, type Department, type MemberRole} from '../lib/api.ts';
import {
  averageEncodings,
  captureSnapshotDataUrl,
  detectFaces,
  extractFaceEncoding128,
} from '../lib/faceEngine.ts';

interface RegisterUserViewProps {
  departments: Department[];
  onUserRegistered: () => void;
}

const TARGET_SAMPLES = 5;

export function RegisterUserView({
  departments,
  onUserRegistered,
}: RegisterUserViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [name, setName] = useState('');
  const [rollNo, setRollNo] = useState('');
  const [departmentId, setDepartmentId] = useState<number>(
    departments[0]?.department_id || 1,
  );
  const [role, setRole] = useState<MemberRole>('Student');

  const [cameraActive, setCameraActive] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [capturedVectors, setCapturedVectors] = useState<number[][]>([]);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (departments.length > 0 && !departments.some((d) => d.department_id === departmentId)) {
      setDepartmentId(departments[0].department_id);
    }
  }, [departments, departmentId]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
    setCapturing(false);
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError('Webcam API is unavailable. Upload 1-5 portrait photos instead.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {facingMode: 'user', width: {ideal: 720}, height: {ideal: 540}},
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err) {
      setCameraError(
        err instanceof Error
          ? `Unable to access webcam (${err.message}). Upload portrait images below instead.`
          : 'Unable to access webcam.',
      );
    }
  };

  const captureMultiFrame = async () => {
    const video = videoRef.current;
    if (!video || !cameraActive) return;

    setCameraError(null);
    setCapturing(true);
    const vectors: number[][] = [...capturedVectors];
    const thumbs: string[] = [...thumbnails];

    let attempts = 0;
    while (vectors.length < TARGET_SAMPLES && attempts < 16) {
      attempts++;
      const faces = await detectFaces(video);
      if (faces.length === 1) {
        const encoding = extractFaceEncoding128(video, faces[0]);
        const snap = captureSnapshotDataUrl(video, faces[0]);
        vectors.push(encoding);
        if (snap) thumbs.push(snap);
        setCapturedVectors([...vectors]);
        setThumbnails([...thumbs]);
      }
      await new Promise((r) => setTimeout(r, 340));
    }

    setCapturing(false);
    if (vectors.length === 0) {
      setCameraError(
        'No clear single face detected. Ensure even lighting and face the camera directly.',
      );
    }
  };

  const handlePhotoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).slice(0, TARGET_SAMPLES);
    if (files.length === 0) return;

    setCameraError(null);
    const nextVectors: number[][] = [...capturedVectors];
    const nextThumbs: string[] = [...thumbnails];

    for (const file of files) {
      if (nextVectors.length >= TARGET_SAMPLES) break;
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(typeof reader.result === 'string' ? reader.result : '');
        reader.readAsDataURL(file);
      });
      if (!dataUrl) continue;

      const img = await new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = dataUrl;
      });
      if (!img) continue;

      const faces = await detectFaces(img);
      const box = faces[0] ?? {
        x: img.naturalWidth * 0.2,
        y: img.naturalHeight * 0.12,
        width: img.naturalWidth * 0.6,
        height: img.naturalHeight * 0.65,
        score: 0.85,
      };
      nextVectors.push(extractFaceEncoding128(img, box));
      nextThumbs.push(captureSnapshotDataUrl(img, box));
    }

    setCapturedVectors(nextVectors);
    setThumbnails(nextThumbs);
    e.target.value = '';
  };

  const resetSamples = () => {
    setCapturedVectors([]);
    setThumbnails([]);
    setCameraError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setSubmitSuccess(null);

    if (capturedVectors.length === 0) {
      setSubmitError('Capture at least 1 facial frame (5 recommended) before registering.');
      return;
    }

    setSubmitting(true);
    try {
      const centroidEncoding = averageEncodings(capturedVectors);
      const res = await api.registerUser({
        name,
        roll_no: rollNo,
        department_id: departmentId,
        role,
        face_encoding: centroidEncoding,
        avatar_url: thumbnails[0] || null,
      });

      setSubmitSuccess(
        `Registered ${res.user.name} (${res.user.roll_no}) with a 128-d averaged facial profile.`,
      );
      setName('');
      setRollNo('');
      setCapturedVectors([]);
      setThumbnails([]);
      stopCamera();
      onUserRegistered();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to register user');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left: Multi-frame Biometric Capture */}
      <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Multi-Frame Face Enrollment
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Captures up to {TARGET_SAMPLES} frames and computes an averaged 128-dimensional encoding
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
                Open Camera
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <CameraOff className="h-4 w-4" />
                Close Camera
              </button>
            )}

            <label className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap">
              <Upload className="h-4 w-4" />
              Upload Photos
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handlePhotoUpload}
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

        <div className="relative aspect-4/3 w-full overflow-hidden rounded-lg border border-slate-200 bg-slate-950 flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-contain ${cameraActive ? 'block' : 'hidden'}`}
          />
          {!cameraActive && (
            <div className="text-center px-6 py-10 max-w-sm">
              <UserPlus className="h-10 w-10 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-100">
                Enrollment Capture Ready
              </p>
              <p className="mt-1 text-xs text-slate-400 leading-relaxed">
                Open the webcam to auto-capture 5 aligned frames, or upload 1–5 clear frontal portraits.
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!cameraActive || capturing || capturedVectors.length >= TARGET_SAMPLES}
              onClick={captureMultiFrame}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-45 transition-colors cursor-pointer whitespace-nowrap"
            >
              {capturing
                ? `Capturing (${capturedVectors.length}/${TARGET_SAMPLES})...`
                : `Capture ${TARGET_SAMPLES} Frames`}
            </button>

            {capturedVectors.length > 0 && (
              <button
                type="button"
                onClick={resetSamples}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset
              </button>
            )}
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600">
            {capturedVectors.length} / {TARGET_SAMPLES} samples collected
          </span>
        </div>

        {/* Captured Thumbnails Strip */}
        <div className="grid grid-cols-5 gap-2.5 pt-2 border-t border-slate-200">
          {Array.from({length: TARGET_SAMPLES}).map((_, idx) => {
            const thumb = thumbnails[idx];
            return (
              <div
                key={idx}
                className="aspect-square rounded-lg border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center"
              >
                {thumb ? (
                  <img
                    src={thumb}
                    alt={`Sample ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-[11px] font-mono text-slate-400">
                    #{idx + 1}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Member Details Form */}
      <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5">
        <h2 className="text-base font-semibold text-slate-900">Member Details</h2>
        <p className="text-xs text-slate-500 mt-0.5 mb-5">
          Store identity metadata alongside the 128-d face encoding in the database
        </p>

        {submitError && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs text-red-800"
          >
            {submitError}
          </div>
        )}

        {submitSuccess && (
          <div
            role="status"
            className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs text-emerald-900 flex items-start gap-2"
          >
            <Check className="h-4 w-4 text-emerald-700 shrink-0 mt-0.5" />
            <span>{submitSuccess}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="reg-name"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="reg-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Priya Nair"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
          </div>

          <div>
            <label
              htmlFor="reg-roll"
              className="block text-xs font-medium text-slate-700 mb-1.5"
            >
              Roll No / Employee ID
            </label>
            <input
              id="reg-roll"
              type="text"
              required
              value={rollNo}
              onChange={(e) => setRollNo(e.target.value)}
              placeholder="e.g. CS-2026-042"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-700/15"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reg-dept"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Department / Class
              </label>
              <select
                id="reg-dept"
                value={departmentId}
                onChange={(e) => setDepartmentId(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              >
                {departments.map((dept) => (
                  <option key={dept.department_id} value={dept.department_id}>
                    {dept.department_name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="reg-role"
                className="block text-xs font-medium text-slate-700 mb-1.5"
              >
                Role
              </label>
              <select
                id="reg-role"
                value={role}
                onChange={(e) => setRole(e.target.value as MemberRole)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
              >
                <option value="Student">Student</option>
                <option value="Faculty">Faculty</option>
                <option value="Staff">Staff</option>
                <option value="Intern">Intern</option>
              </select>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs text-slate-600 flex items-center justify-between">
            <span>128-D Encoding Readiness</span>
            <span
              className={`font-medium tabular-nums ${
                capturedVectors.length > 0 ? 'text-emerald-700' : 'text-slate-500'
              }`}
            >
              {capturedVectors.length > 0
                ? `Ready (${capturedVectors.length} frames averaged)`
                : 'Waiting for capture'}
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting || capturedVectors.length === 0}
            className="w-full rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-800 disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            {submitting ? 'Saving Profile...' : 'Register Member & Encoding'}
          </button>
        </form>
      </div>
    </div>
  );
}
