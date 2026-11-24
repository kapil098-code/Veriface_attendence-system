export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
  score: number;
}

interface NativeDetectedFace {
  boundingBox: DOMRectReadOnly;
}

interface NativeFaceDetector {
  detect(image: ImageBitmapSource): Promise<NativeDetectedFace[]>;
}

declare global {
  interface Window {
    FaceDetector?: new (options?: {
      fastMode?: boolean;
      maxDetectedFaces?: number;
    }) => NativeFaceDetector;
  }
}

let cachedNativeDetector: NativeFaceDetector | null | undefined;

function getNativeDetector(): NativeFaceDetector | null {
  if (cachedNativeDetector !== undefined) {
    return cachedNativeDetector;
  }
  if (typeof window !== 'undefined' && typeof window.FaceDetector === 'function') {
    try {
      cachedNativeDetector = new window.FaceDetector({
        fastMode: true,
        maxDetectedFaces: 4,
      });
    } catch {
      cachedNativeDetector = null;
    }
  } else {
    cachedNativeDetector = null;
  }
  return cachedNativeDetector;
}

function getSourceDimensions(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): {width: number; height: number} {
  if (source instanceof HTMLVideoElement) {
    return {width: source.videoWidth, height: source.videoHeight};
  }
  if (source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return {width: source.width, height: source.height};
}

/**
 * Pure-TS fallback face detector combining YCbCr skin-chromaticity clustering
 * with internal luminance variance (eye/brow/mouth contrast) on a downsampled grid.
 */
function detectFaceHeuristic(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): FaceBox[] {
  const {width: srcW, height: srcH} = getSourceDimensions(source);
  if (srcW < 20 || srcH < 20) return [];

  const scanW = 160;
  const scanH = Math.max(90, Math.round((srcH / srcW) * scanW));

  const canvas = document.createElement('canvas');
  canvas.width = scanW;
  canvas.height = scanH;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return [];

  ctx.drawImage(source, 0, 0, scanW, scanH);
  const {data} = ctx.getImageData(0, 0, scanW, scanH);

  // Build integral arrays for skin mask and luminance + squared luminance
  const stride = scanW + 1;
  const skinInt = new Float64Array(stride * (scanH + 1));
  const lumInt = new Float64Array(stride * (scanH + 1));
  const lumSqInt = new Float64Array(stride * (scanH + 1));

  for (let y = 0; y < scanH; y++) {
    let rowSkin = 0;
    let rowLum = 0;
    let rowLumSq = 0;
    for (let x = 0; x < scanW; x++) {
      const idx = (y * scanW + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
      const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;

      const isSkin =
        cb >= 76 && cb <= 129 && cr >= 132 && cr <= 178 && lum >= 35 && lum <= 245
          ? 1
          : 0;

      rowSkin += isSkin;
      rowLum += lum;
      rowLumSq += lum * lum;

      const cur = (y + 1) * stride + (x + 1);
      const above = y * stride + (x + 1);
      skinInt[cur] = skinInt[above] + rowSkin;
      lumInt[cur] = lumInt[above] + rowLum;
      lumSqInt[cur] = lumSqInt[above] + rowLumSq;
    }
  }

  const rectSum = (arr: Float64Array, x0: number, y0: number, x1: number, y1: number) =>
    arr[y1 * stride + x1] -
    arr[y0 * stride + x1] -
    arr[y1 * stride + x0] +
    arr[y0 * stride + x0];

  let bestScore = 0;
  let bestBox: FaceBox | null = null;

  const minWinW = Math.round(scanW * 0.18);
  const maxWinW = Math.round(scanW * 0.62);
  const stepWin = Math.max(4, Math.round(scanW * 0.05));

  for (let w = minWinW; w <= maxWinW; w += stepWin) {
    const h = Math.round(w * 1.18);
    if (h >= scanH) continue;

    const area = w * h;
    for (let y = 2; y + h < scanH - 2; y += 4) {
      for (let x = 2; x + w < scanW - 2; x += 4) {
        const skinCount = rectSum(skinInt, x, y, x + w, y + h);
        const skinRatio = skinCount / area;
        if (skinRatio < 0.34 || skinRatio > 0.94) continue;

        // Check eye/nose contrast variance inside face box
        const sumL = rectSum(lumInt, x, y, x + w, y + h);
        const sumLSq = rectSum(lumSqInt, x, y, x + w, y + h);
        const meanL = sumL / area;
        const variance = Math.max(0, sumLSq / area - meanL * meanL);
        const stdL = Math.sqrt(variance);
        if (stdL < 14) continue;

        // Upper-center facial density preference (avoids neck/hands)
        const cx = (x + w / 2) / scanW;
        const cy = (y + h / 2) / scanH;
        const centerBonus = 1 - 0.25 * (Math.abs(cx - 0.5) + Math.abs(cy - 0.45));

        const score = skinRatio * Math.min(1.4, stdL / 32) * centerBonus;
        if (score > bestScore) {
          bestScore = score;
          bestBox = {
            x: (x / scanW) * srcW,
            y: (y / scanH) * srcH,
            width: (w / scanW) * srcW,
            height: (h / scanH) * srcH,
            score: Math.min(0.99, score),
          };
        }
      }
    }
  }

  return bestBox && bestScore > 0.26 ? [bestBox] : [];
}

export async function detectFaces(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
): Promise<FaceBox[]> {
  const {width, height} = getSourceDimensions(source);
  if (width === 0 || height === 0) return [];

  const native = getNativeDetector();
  if (native) {
    try {
      const detected = await native.detect(source);
      if (detected.length > 0) {
        return detected.map((f) => ({
          x: Math.max(0, f.boundingBox.x),
          y: Math.max(0, f.boundingBox.y),
          width: Math.min(width - f.boundingBox.x, f.boundingBox.width),
          height: Math.min(height - f.boundingBox.y, f.boundingBox.height),
          score: 0.96,
        }));
      }
    } catch {
      // Fall through to pure-TS detector
    }
  }

  return detectFaceHeuristic(source);
}

/**
 * Extracts a deterministic L2-normalized 128-dimensional facial encoding from a detected box:
 * - 64 dims: 8x8 normalized facial luminance structure
 * - 64 dims: 4x4 spatial cell x 4-orientation Sobel gradient histogram
 */
export function extractFaceEncoding128(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  box: FaceBox,
): number[] {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', {willReadFrequently: true});
  if (!ctx) return new Array(128).fill(0);

  // Slight inset crop focuses strictly on inner facial features (eyes, nose, mouth)
  const padX = box.width * 0.08;
  const padY = box.height * 0.06;
  const sx = Math.max(0, box.x + padX);
  const sy = Math.max(0, box.y + padY);
  const sw = Math.max(8, box.width - padX * 2);
  const sh = Math.max(8, box.height - padY * 2);

  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, size, size);
  const {data} = ctx.getImageData(0, 0, size, size);

  const gray = new Float64Array(size * size);
  let mean = 0;
  for (let i = 0; i < size * size; i++) {
    const p = i * 4;
    const lum = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2];
    gray[i] = lum;
    mean += lum;
  }
  mean /= size * size;

  let varSum = 0;
  for (let i = 0; i < gray.length; i++) {
    const d = gray[i] - mean;
    varSum += d * d;
  }
  const std = Math.sqrt(varSum / gray.length) || 1;
  for (let i = 0; i < gray.length; i++) {
    gray[i] = (gray[i] - mean) / std;
  }

  const vec: number[] = [];

  // Part 1: 8x8 spatial appearance blocks (64 dims)
  for (let by = 0; by < 8; by++) {
    for (let bx = 0; bx < 8; bx++) {
      let blockSum = 0;
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 4; dx++) {
          blockSum += gray[(by * 4 + dy) * size + (bx * 4 + dx)];
        }
      }
      vec.push(blockSum / 16);
    }
  }

  // Part 2: 4x4 cell x 4-orientation Sobel gradient histogram (64 dims)
  for (let cy = 0; cy < 4; cy++) {
    for (let cx = 0; cx < 4; cx++) {
      const bins = [0, 0, 0, 0];
      for (let py = 0; py < 8; py++) {
        for (let px = 0; px < 8; px++) {
          const y = cy * 8 + py;
          const x = cx * 8 + px;
          const xm = Math.max(0, x - 1);
          const xp = Math.min(size - 1, x + 1);
          const ym = Math.max(0, y - 1);
          const yp = Math.min(size - 1, y + 1);

          const gx = gray[y * size + xp] - gray[y * size + xm];
          const gy = gray[yp * size + x] - gray[ym * size + x];

          if (gx >= 0) bins[0] += gx;
          else bins[1] += -gx;
          if (gy >= 0) bins[2] += gy;
          else bins[3] += -gy;
        }
      }
      vec.push(bins[0] / 32, bins[1] / 32, bins[2] / 32, bins[3] / 32);
    }
  }

  // L2 normalize
  let normSq = 0;
  for (let i = 0; i < vec.length; i++) {
    normSq += vec[i] * vec[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function averageEncodings(encodings: number[][]): number[] {
  if (encodings.length === 0) return [];
  const dim = encodings[0].length;
  const mean = new Array<number>(dim).fill(0);
  for (const enc of encodings) {
    for (let i = 0; i < dim; i++) {
      mean[i] += enc[i];
    }
  }
  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    mean[i] /= encodings.length;
    normSq += mean[i] * mean[i];
  }
  const norm = Math.sqrt(normSq) || 1;
  return mean.map((v) => Number((v / norm).toFixed(6)));
}

export function captureSnapshotDataUrl(
  source: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement,
  box?: FaceBox,
): string {
  const {width, height} = getSourceDimensions(source);
  const canvas = document.createElement('canvas');
  canvas.width = 240;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (!ctx || width === 0 || height === 0) return '';

  if (box) {
    const expand = 0.3;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const side = Math.min(Math.max(box.width, box.height) * (1 + expand), Math.min(width, height));
    const sx = Math.max(0, Math.min(width - side, cx - side / 2));
    const sy = Math.max(0, Math.min(height - side, cy - side / 2));
    ctx.drawImage(source, sx, sy, side, side, 0, 0, 240, 240);
  } else {
    const side = Math.min(width, height);
    const sx = (width - side) / 2;
    const sy = (height - side) / 2;
    ctx.drawImage(source, sx, sy, side, side, 0, 0, 240, 240);
  }
  return canvas.toDataURL('image/jpeg', 0.86);
}

export async function encodeImageUrl(imageUrl: string): Promise<number[] | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = async () => {
      const faces = await detectFaces(img);
      const box = faces[0] ?? {
        x: img.naturalWidth * 0.25,
        y: img.naturalHeight * 0.14,
        width: img.naturalWidth * 0.5,
        height: img.naturalHeight * 0.58,
        score: 0.9,
      };
      resolve(extractFaceEncoding128(img, box));
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
