/**
 * Motor Client-Side de Inferência ONNX Local (`src/lib/local-onnx.ts`).
 *
 * Executa localmente no dispositivo do usuário (celular ou PC, online ou 100% offline):
 * - `/models/identifier.onnx` (512x512 Letterbox): detector anatômico de traseira/garupa bovina.
 * - `/models/version-RFB-320.onnx` (320x240): guarda semântico UltraFace contra rostos humanos.
 * - `/models/yolo11n.onnx` (640x640 Letterbox): guarda semântico COCO contra pessoas e objetos.
 */
import type { VisionScoreResult } from "./vision-client";

export type LocalAiModelStatus = "idle" | "loading" | "ready" | "unavailable";

interface NormalizedBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface RectBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

interface GuardEvaluation {
  rejectedReason?: "human-detected" | "non-bovine-detected";
  feedback?: string;
  cappedScore?: number;
}

const TARGET_INFERENCE_SIZE = 512;
const COCO_INFERENCE_SIZE = 640;
const FACE_INPUT_WIDTH = 320;
const FACE_INPUT_HEIGHT = 240;
const MIN_BOX_DIM_PX = 20;

const MODEL_URLS = {
  identifier: "/models/identifier.onnx",
  face: "/models/version-RFB-320.onnx",
  coco: "/models/yolo11n.onnx",
} as const;

const ORT_CACHE_NAME = "cattle-capture-pwa-v3";

const COCO_NON_BOVINE_LABELS: Record<number, string> = {
  0: "pessoa",
  1: "bicicleta",
  2: "carro",
  3: "motocicleta",
  5: "ônibus",
  7: "caminhão",
  15: "gato",
  16: "cachorro",
  24: "mochila",
  26: "bolsa",
  28: "mala",
  39: "garrafa",
  41: "xícara",
  56: "cadeira",
  57: "sofá",
  58: "planta",
  59: "cama",
  60: "mesa",
  62: "tela/TV",
  63: "notebook",
  66: "teclado",
  67: "celular",
  73: "livro",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortModule: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let identifierSession: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceSession: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cocoSession: any | null = null;
let initPromise: Promise<boolean> | null = null;
let modelStatus: LocalAiModelStatus = "idle";
let inferenceQueue: Promise<void> = Promise.resolve();
let scratchCanvas: HTMLCanvasElement | null = null;

function yieldToBrowserFrame(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const run = inferenceQueue.then(task, task);
  inferenceQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function getScratchCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (!scratchCanvas) {
    scratchCanvas = document.createElement("canvas");
  }
  if (scratchCanvas.width !== width) scratchCanvas.width = width;
  if (scratchCanvas.height !== height) scratchCanvas.height = height;
  return scratchCanvas;
}

async function fetchModelBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { cache: "force-cache" });
  if (!res.ok) {
    throw new Error(`Falha ao carregar modelo local ${url} (${res.status})`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
}

export async function warmUpLocalVisionModels(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (identifierSession && ortModule) {
    modelStatus = "ready";
    return true;
  }
  if (initPromise) return initPromise;

  modelStatus = "loading";
  initPromise = (async () => {
    try {
      const ort = await import("onnxruntime-web/wasm");
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.simd = true;
      ort.env.wasm.numThreads =
        typeof self !== "undefined" && self.crossOriginIsolated ? 2 : 1;

      const idBytes = await fetchModelBytes(MODEL_URLS.identifier);
      const sessionOpts = {
        executionProviders: ["wasm"] as const,
        logSeverityLevel: 3 as const,
      };
      identifierSession = await ort.InferenceSession.create(idBytes, sessionOpts);
      ortModule = ort;

      try {
        const faceBytes = await fetchModelBytes(MODEL_URLS.face);
        faceSession = await ort.InferenceSession.create(faceBytes, sessionOpts);
      } catch (err) {
        console.warn("[LocalAI] UltraFace guard indisponível:", err);
      }

      try {
        const cocoBytes = await fetchModelBytes(MODEL_URLS.coco);
        cocoSession = await ort.InferenceSession.create(cocoBytes, sessionOpts);
      } catch (err) {
        console.warn("[LocalAI] COCO guard indisponível:", err);
      }

      modelStatus = "ready";
      return true;
    } catch (err) {
      console.warn("[LocalAI] Falha ao inicializar ONNX local no navegador:", err);
      modelStatus = "unavailable";
      return false;
    } finally {
      initPromise = null;
    }
  })();

  return initPromise;
}

export function getLocalVisionStatus(): LocalAiModelStatus {
  return modelStatus;
}

export async function cacheLocalModelsForOffline(): Promise<boolean> {
  if (typeof window === "undefined" || !("caches" in window)) return false;
  try {
    const cache = await caches.open(ORT_CACHE_NAME);
    const urls = [
      MODEL_URLS.identifier,
      MODEL_URLS.face,
      MODEL_URLS.coco,
      "/ort/ort-wasm-simd-threaded.mjs",
      "/ort/ort-wasm-simd-threaded.wasm",
    ];
    await Promise.all(
      urls.map(async (u) => {
        const existing = await cache.match(u);
        if (!existing) {
          const resp = await fetch(u, { cache: "force-cache" });
          if (resp.ok) await cache.put(u, resp);
        }
      })
    );
    return true;
  } catch {
    return false;
  }
}

function calibrateYoloScore(rawConf: number): number {
  if (!Number.isFinite(rawConf) || rawConf <= 0) return 0;
  if (rawConf >= 1.0) return 100;
  return Math.round(rawConf * 1000) / 10;
}

function buildFeedback(score: number, box?: NormalizedBox): string {
  if (box && score >= 15) {
    const leftEdge = box.cx - box.w / 2;
    const rightEdge = box.cx + box.w / 2;
    const topEdge = box.cy - box.h / 2;
    const bottomEdge = box.cy + box.h / 2;
    const touchesEdge =
      leftEdge < 0.015 || rightEdge > 0.985 || topEdge < 0.015 || bottomEdge > 0.985;

    if (score >= 70) {
      if (touchesEdge && (box.w > 0.85 || box.h > 0.85)) {
        return "Traseira detectada, mas próxima das bordas. Recue ligeiramente para preservar a anatomia.";
      }
      return "Enquadramento excelente! Traseira e garupa bovina identificadas com alta precisão no dispositivo.";
    }

    if (score >= 40) {
      if (box.cx < 0.3) return "Traseira reconhecida à esquerda — centralize o animal na mira.";
      if (box.cx > 0.7) return "Traseira reconhecida à direita — centralize o animal na mira.";
      if (touchesEdge && (box.w > 0.85 || box.h > 0.85)) {
        return "Traseira parcialmente nas bordas — recue meio passo para melhorar o foco.";
      }
      if (Math.max(box.w, box.h) < 0.24) {
        return "Traseira reconhecida ao fundo — aproxime para 1m a 1,5m.";
      }
      return "Enquadramento aceitável. Traseira bovina reconhecida pelo modelo local.";
    }

    if (box.cx < 0.28 || box.cx > 0.72) {
      return "Animal fora do centro — alinhe a garupa no centro da mira.";
    }
    if (Math.max(box.w, box.h) < 0.22) {
      return "Traseira muito distante — aproxime (1m a 1,5m) para enquadrar a garupa.";
    }
  }

  if (score >= 70) {
    return "Enquadramento excelente! Traseira e garupa bovina identificadas com alta precisão no dispositivo.";
  }
  if (score >= 40) {
    return "Enquadramento aceitável. Traseira bovina reconhecida pelo modelo local.";
  }
  return "Baixa confiança para traseira bovina. Aproxime (1m a 1,5m) e centralize a garupa.";
}

function toRectBox(box: NormalizedBox): RectBox {
  return {
    x1: Math.max(0, box.cx - box.w / 2),
    y1: Math.max(0, box.cy - box.h / 2),
    x2: Math.min(1, box.cx + box.w / 2),
    y2: Math.min(1, box.cy + box.h / 2),
  };
}

function computeOverlap(a: RectBox, b: RectBox): { iou: number; coverA: number } {
  const ix1 = Math.max(a.x1, b.x1);
  const iy1 = Math.max(a.y1, b.y1);
  const ix2 = Math.min(a.x2, b.x2);
  const iy2 = Math.min(a.y2, b.y2);
  const iw = Math.max(0, ix2 - ix1);
  const ih = Math.max(0, iy2 - iy1);
  const inter = iw * ih;
  if (inter <= 0) return { iou: 0, coverA: 0 };
  const areaA = Math.max(1e-6, (a.x2 - a.x1) * (a.y2 - a.y1));
  const areaB = Math.max(1e-6, (b.x2 - b.x1) * (b.y2 - b.y1));
  return {
    iou: inter / (areaA + areaB - inter),
    coverA: inter / areaA,
  };
}

async function decodeBlobOriented(
  blob: Blob
): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image" });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      try {
        const bitmap = await createImageBitmap(blob);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          close: () => bitmap.close(),
        };
      } catch {
        // Fallback para HTMLImageElement
      }
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function buildLetterboxTensor(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  targetSize: number
) {
  const canvas = getScratchCanvas(targetSize, targetSize);
  if (!canvas) {
    throw new Error("Canvas 2D indisponível para pré-processamento");
  }
  const ctx = canvas.getContext("2d", { willReadFrequently: true, alpha: false });
  if (!ctx) {
    throw new Error("Contexto 2D indisponível");
  }

  const scale = Math.min(targetSize / sw, targetSize / sh);
  const scaledW = Math.round(sw * scale);
  const scaledH = Math.round(sh * scale);
  const padX = Math.floor((targetSize - scaledW) / 2);
  const padY = Math.floor((targetSize - scaledH) / 2);

  ctx.fillStyle = "rgb(114, 114, 114)";
  ctx.fillRect(0, 0, targetSize, targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, padX, padY, scaledW, scaledH);

  const rgba = ctx.getImageData(0, 0, targetSize, targetSize).data;
  const totalPixels = targetSize * targetSize;
  const float32Data = new Float32Array(totalPixels * 3);
  const inv255 = 1 / 255.0;
  const planeG = totalPixels;
  const planeB = totalPixels * 2;

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 4;
    float32Data[i] = rgba[base] * inv255;
    float32Data[planeG + i] = rgba[base + 1] * inv255;
    float32Data[planeB + i] = rgba[base + 2] * inv255;
  }

  return { float32Data, scaledW, scaledH, padX, padY };
}

async function runIdentifierPass(
  source: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number
): Promise<{ score: number; rawConfidence: number; box: NormalizedBox }> {
  const { float32Data, scaledW, scaledH, padX, padY } = buildLetterboxTensor(
    source,
    sx,
    sy,
    sw,
    sh,
    TARGET_INFERENCE_SIZE
  );

  const inputTensor = new ortModule.Tensor("float32", float32Data, [
    1,
    3,
    TARGET_INFERENCE_SIZE,
    TARGET_INFERENCE_SIZE,
  ]);
  const inputName = identifierSession.inputNames?.[0] || "images";
  const results = await identifierSession.run({ [inputName]: inputTensor });
  const outputName = identifierSession.outputNames?.[0] || Object.keys(results)[0];
  const outputTensor = results[outputName];
  const outputData = outputTensor.data as Float32Array;
  const numAnchors = outputTensor.dims?.[2] || Math.floor(outputData.length / 5);

  let maxConf = 0;
  let bestIdx = -1;

  for (let i = 0; i < numAnchors; i++) {
    const score = outputData[4 * numAnchors + i];
    if (score <= maxConf) continue;

    const w = outputData[2 * numAnchors + i];
    const h = outputData[3 * numAnchors + i];
    if (!Number.isFinite(w) || !Number.isFinite(h)) continue;
    if (w < MIN_BOX_DIM_PX || h < MIN_BOX_DIM_PX) continue;

    maxConf = score;
    bestIdx = i;
  }

  if (bestIdx === -1) {
    return {
      score: 0,
      rawConfidence: 0,
      box: { cx: 0.5, cy: 0.5, w: 0, h: 0 },
    };
  }

  const rawCx = outputData[0 * numAnchors + bestIdx] ?? TARGET_INFERENCE_SIZE / 2;
  const rawCy = outputData[1 * numAnchors + bestIdx] ?? TARGET_INFERENCE_SIZE / 2;
  const rawW = outputData[2 * numAnchors + bestIdx] ?? TARGET_INFERENCE_SIZE / 2;
  const rawH = outputData[3 * numAnchors + bestIdx] ?? TARGET_INFERENCE_SIZE / 2;

  return {
    score: calibrateYoloScore(maxConf),
    rawConfidence: maxConf,
    box: {
      cx: Math.max(0, Math.min(1, (rawCx - padX) / Math.max(1, scaledW))),
      cy: Math.max(0, Math.min(1, (rawCy - padY) / Math.max(1, scaledH))),
      w: Math.max(0, Math.min(1, rawW / Math.max(1, scaledW))),
      h: Math.max(0, Math.min(1, rawH / Math.max(1, scaledH))),
    },
  };
}

async function runFaceGuardPass(
  source: CanvasImageSource,
  origW: number,
  origH: number
): Promise<{ score: number; box: RectBox | null }> {
  if (!faceSession) return { score: 0, box: null };

  try {
    const canvas = getScratchCanvas(FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT);
    const ctx = canvas?.getContext("2d", { willReadFrequently: true, alpha: false });
    if (!canvas || !ctx) return { score: 0, box: null };

    ctx.drawImage(source, 0, 0, origW, origH, 0, 0, FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT);
    const rgba = ctx.getImageData(0, 0, FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT).data;

    const totalPixels = FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT;
    const tensorData = new Float32Array(totalPixels * 3);
    const planeG = totalPixels;
    const planeB = totalPixels * 2;
    const inv128 = 1 / 128.0;

    for (let i = 0; i < totalPixels; i++) {
      const base = i * 4;
      tensorData[i] = (rgba[base] - 127.0) * inv128;
      tensorData[planeG + i] = (rgba[base + 1] - 127.0) * inv128;
      tensorData[planeB + i] = (rgba[base + 2] - 127.0) * inv128;
    }

    const inputName = faceSession.inputNames?.[0] || "input";
    const out = await faceSession.run({
      [inputName]: new ortModule.Tensor("float32", tensorData, [
        1,
        3,
        FACE_INPUT_HEIGHT,
        FACE_INPUT_WIDTH,
      ]),
    });

    const scoresTensor = out[faceSession.outputNames?.[0] || "scores"];
    const boxesTensor = out[faceSession.outputNames?.[1] || "boxes"];
    const numAnchors = scoresTensor.dims?.[1] || 0;
    const scoresData = scoresTensor.data as Float32Array;
    const boxesData = boxesTensor.data as Float32Array;

    let bestScore = 0;
    let bestBox: RectBox | null = null;
    for (let i = 0; i < numAnchors; i++) {
      const s = scoresData[i * 2 + 1];
      if (s > bestScore) {
        bestScore = s;
        bestBox = {
          x1: Math.max(0, boxesData[i * 4]),
          y1: Math.max(0, boxesData[i * 4 + 1]),
          x2: Math.min(1, boxesData[i * 4 + 2]),
          y2: Math.min(1, boxesData[i * 4 + 3]),
        };
      }
    }

    return { score: bestScore, box: bestBox };
  } catch {
    return { score: 0, box: null };
  }
}

async function runCocoGuardPass(
  source: CanvasImageSource,
  origW: number,
  origH: number
) {
  if (!cocoSession) {
    return {
      personScore: 0,
      personBox: null as RectBox | null,
      bovineScore: 0,
      bovineBox: null as RectBox | null,
      otherScore: 0,
      otherLabel: null as string | null,
    };
  }

  try {
    const { float32Data, scaledW, scaledH, padX, padY } = buildLetterboxTensor(
      source,
      0,
      0,
      origW,
      origH,
      COCO_INFERENCE_SIZE
    );
    const inputName = cocoSession.inputNames?.[0] || "images";
    const out = await cocoSession.run({
      [inputName]: new ortModule.Tensor("float32", float32Data, [
        1,
        3,
        COCO_INFERENCE_SIZE,
        COCO_INFERENCE_SIZE,
      ]),
    });

    const outTensor = out[cocoSession.outputNames?.[0] || "output0"];
    const data = outTensor.data as Float32Array;
    const numAnchors = outTensor.dims?.[2] || 8400;
    const numClasses = (outTensor.dims?.[1] || 84) - 4;

    const decodeBox = (idx: number): RectBox => {
      const cx = (data[idx] - padX) / Math.max(1, scaledW);
      const cy = (data[numAnchors + idx] - padY) / Math.max(1, scaledH);
      const w = data[2 * numAnchors + idx] / Math.max(1, scaledW);
      const h = data[3 * numAnchors + idx] / Math.max(1, scaledH);
      return {
        x1: Math.max(0, cx - w / 2),
        y1: Math.max(0, cy - h / 2),
        x2: Math.min(1, cx + w / 2),
        y2: Math.min(1, cy + h / 2),
      };
    };

    let personScore = 0;
    let personBox: RectBox | null = null;
    let bovineScore = 0;
    let bovineBox: RectBox | null = null;
    let otherScore = 0;
    let otherCls = -1;

    for (let i = 0; i < numAnchors; i++) {
      const p = data[4 * numAnchors + i];
      if (p > personScore) {
        personScore = p;
        personBox = decodeBox(i);
      }

      const q = Math.max(
        data[(4 + 19) * numAnchors + i],
        data[(4 + 17) * numAnchors + i],
        data[(4 + 18) * numAnchors + i]
      );
      if (q > bovineScore) {
        bovineScore = q;
        bovineBox = decodeBox(i);
      }

      for (const clsStr of Object.keys(COCO_NON_BOVINE_LABELS)) {
        const cls = Number(clsStr);
        if (cls === 0 || cls >= numClasses) continue;
        const sc = data[(4 + cls) * numAnchors + i];
        if (sc > otherScore) {
          otherScore = sc;
          otherCls = cls;
        }
      }
    }

    return {
      personScore,
      personBox,
      bovineScore,
      bovineBox,
      otherScore,
      otherLabel: otherCls >= 0 ? COCO_NON_BOVINE_LABELS[otherCls] ?? null : null,
    };
  } catch {
    return {
      personScore: 0,
      personBox: null as RectBox | null,
      bovineScore: 0,
      bovineBox: null as RectBox | null,
      otherScore: 0,
      otherLabel: null as string | null,
    };
  }
}

function classifySemanticSignals(
  face: { score: number; box: RectBox | null },
  coco: {
    personScore: number;
    personBox: RectBox | null;
    bovineScore: number;
    bovineBox: RectBox | null;
    otherScore: number;
    otherLabel: string | null;
  },
  backScore: number,
  backBox: NormalizedBox
): GuardEvaluation {
  if (!faceSession && !cocoSession) return {};

  const hasStrongHuman = face.score >= 0.6 || coco.personScore >= 0.45;
  const hasBovineSignal = coco.bovineScore >= 0.25;

  if (hasStrongHuman && !hasBovineSignal) {
    return {
      rejectedReason: "human-detected",
      cappedScore: Math.min(backScore, 10),
      feedback: "Rosto ou pessoa detectada — enquadre apenas a traseira do bovino.",
    };
  }

  if (hasStrongHuman && hasBovineSignal && backBox.w > 0 && backBox.h > 0) {
    const backRect = toRectBox(backBox);
    const faceOverlap = face.box ? computeOverlap(backRect, face.box) : { iou: 0, coverA: 0 };
    const personOverlap = coco.personBox
      ? computeOverlap(backRect, coco.personBox)
      : { iou: 0, coverA: 0 };
    const bovineOverlap = coco.bovineBox
      ? computeOverlap(backRect, coco.bovineBox)
      : { iou: 0, coverA: 0 };

    const targetIsFace = face.score >= 0.6 && (faceOverlap.coverA >= 0.45 || faceOverlap.iou >= 0.25);
    const targetIsPersonNotCow =
      coco.personScore >= 0.45 && personOverlap.coverA >= 0.55 && bovineOverlap.coverA < 0.35;

    if (targetIsFace || targetIsPersonNotCow) {
      return {
        rejectedReason: "human-detected",
        cappedScore: Math.min(backScore, 12),
        feedback: "Rosto ou pessoa na mira — centralize apenas a traseira do bovino.",
      };
    }
  }

  if (!hasBovineSignal && coco.otherScore >= 0.52 && coco.otherLabel) {
    return {
      rejectedReason: "non-bovine-detected",
      cappedScore: Math.min(backScore, 14),
      feedback: `Objeto não bovino identificado (${coco.otherLabel}) — enquadre a traseira do animal.`,
    };
  }

  return {};
}

export async function analyzeBlobLocally(
  blob: Blob,
  mode: "live" | "full" = "full"
): Promise<VisionScoreResult | null> {
  return enqueueInference(async () => {
    const ready = await warmUpLocalVisionModels();
    if (!ready || !identifierSession || !ortModule) return null;

    const decoded = await decodeBlobOriented(blob);
    try {
      const origW = decoded.width;
      const origH = decoded.height;
      if (!origW || !origH) return null;

      let best = await runIdentifierPass(decoded.source, 0, 0, origW, origH);
      await yieldToBrowserFrame();
      const faceSignals = await runFaceGuardPass(decoded.source, origW, origH);
      await yieldToBrowserFrame();
      const cocoSignals = await runCocoGuardPass(decoded.source, origW, origH);

      const preliminaryGuard = classifySemanticSignals(
        faceSignals,
        cocoSignals,
        best.score,
        best.box
      );

      if (
        mode === "full" &&
        !preliminaryGuard.rejectedReason &&
        best.score < 45 &&
        origW >= 400 &&
        origH >= 400
      ) {
        const cropW = Math.round(origW * 0.68);
        const cropH = Math.round(origH * 0.68);
        const cropLeft = Math.floor((origW - cropW) / 2);
        const cropTop = Math.floor((origH - cropH) / 2);
        await yieldToBrowserFrame();

        const cropBest = await runIdentifierPass(
          decoded.source,
          cropLeft,
          cropTop,
          cropW,
          cropH
        );
        if (
          cropBest.rawConfidence > best.rawConfidence &&
          cropBest.box.w > 0 &&
          cropBest.box.h > 0
        ) {
          best = {
            score: cropBest.score,
            rawConfidence: cropBest.rawConfidence,
            box: {
              cx: Math.max(0, Math.min(1, (cropLeft + cropBest.box.cx * cropW) / origW)),
              cy: Math.max(0, Math.min(1, (cropTop + cropBest.box.cy * cropH) / origH)),
              w: Math.max(0, Math.min(1, (cropBest.box.w * cropW) / origW)),
              h: Math.max(0, Math.min(1, (cropBest.box.h * cropH) / origH)),
            },
          };
        }
      }

      const guard = classifySemanticSignals(faceSignals, cocoSignals, best.score, best.box);
      if (guard.rejectedReason) {
        const rejectedScore = Math.max(0, Math.round((guard.cappedScore ?? 10) * 10) / 10);
        return {
          score: rejectedScore,
          confidence: rejectedScore,
          lowQuality: true,
          source: "yolo-onnx",
          rejectedReason: guard.rejectedReason,
          box: best.box,
          feedback: guard.feedback || "Imagem não corresponde à traseira de um bovino.",
        };
      }

      return {
        score: best.score,
        confidence: best.score,
        lowQuality: best.score < 40.0,
        source: "yolo-onnx",
        box: best.box,
        feedback: buildFeedback(best.score, best.box),
      };
    } catch (err) {
      console.warn("[LocalAI] Erro na inferência local do frame:", err);
      return null;
    } finally {
      decoded.close();
    }
  });
}
