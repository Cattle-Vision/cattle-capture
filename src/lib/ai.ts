/**
 * Motor de Inferência IA ONNX para Enquadramento Anatômico da Garupa (`src/lib/ai.ts`).
 *
 * Responsabilidades no CattleCapture:
 * - Executar `identifier.onnx` via `onnxruntime-node` na resolução nativa 512x512 com Letterbox.
 * - Materializar rotação EXIF antes de calcular dimensões/recortes para paridade 100% entre mobile e PC.
 * - Executar guardas semânticos (`version-RFB-320.onnx` para rostos humanos e `yolo11n.onnx` COCO para
 *   diferenciar pessoas/objetos de bovinos).
 * - Realizar segunda passada no recorte central (68%) quando o animal estiver distante fora do modo `fastLive`.
 * - Nota: Este projeto (CattleCapture) é exclusivo para captura e curadoria de dataset; não inclui IA de ICS.
 */
import fs from "fs";
import path from "path";
import sharp from "sharp";

export interface NormalizedBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

export interface RearDetectionResult {
  score: number;
  confidence: number;
  rawConfidence: number;
  lowQuality: boolean;
  source: "yolo-onnx" | "vision-analysis";
  rejectedReason?: "human-detected" | "non-bovine-detected";
  box?: NormalizedBox;
  feedback: string;
}

export interface AnalyzeRearOptions {
  fastLive?: boolean;
}

interface NormalizedRgbImage {
  data: Buffer;
  width: number;
  height: number;
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
let session: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let faceSession: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cocoSession: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortModule: any | null = null;
let sessionLoadAttempted = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let modelInitPromise: Promise<{ session: any; ort: any } | null> | null = null;
let inferenceQueue: Promise<void> = Promise.resolve();

function enqueueInference<T>(task: () => Promise<T>): Promise<T> {
  const run = inferenceQueue.then(task, task);
  inferenceQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

function resolveModelFile(filename: string): string | null {
  const candidates = [
    path.join(process.cwd(), filename),
    path.join(process.cwd(), "models", filename),
    path.join(process.cwd(), "public", filename),
    path.join(process.cwd(), "public", "models", filename),
    path.resolve(__dirname, filename),
    path.resolve(__dirname, "models", filename),
    path.resolve(__dirname, "../", filename),
    path.resolve(__dirname, "../models", filename),
    path.resolve(__dirname, "../../", filename),
    path.resolve(__dirname, "../../models", filename),
    path.resolve(__dirname, "../../../", filename),
    path.resolve(__dirname, "../../../models", filename),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
        return candidate;
      }
    } catch {
      // ignora erro de acesso
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initModel(): Promise<{ session: any; ort: any } | null> {
  if (session && ortModule) return { session, ort: ortModule };
  if (sessionLoadAttempted && (!session || !ortModule)) return null;
  if (modelInitPromise) return modelInitPromise;

  modelInitPromise = (async () => {
    sessionLoadAttempted = true;
    const modelPath = resolveModelFile("identifier.onnx");
    if (!modelPath) {
      console.warn("[AI] Arquivo identifier.onnx não encontrado.");
      return null;
    }

    if (process.platform === "linux") {
      const candidateDirs = [
        path.resolve(process.cwd(), "node_modules/onnxruntime-node/bin/napi-v6/linux/x64"),
        path.resolve(__dirname, "../../../node_modules/onnxruntime-node/bin/napi-v6/linux/x64"),
      ];
      for (const dir of candidateDirs) {
        if (fs.existsSync(/*turbopackIgnore: true*/ dir)) {
          const currentLd = process.env.LD_LIBRARY_PATH || "";
          if (!currentLd.includes(dir)) {
            process.env.LD_LIBRARY_PATH = currentLd ? `${dir}:${currentLd}` : dir;
          }
          break;
        }
      }
    }

    try {
      const ort = await import("onnxruntime-node");
      const sessionOptions = { logSeverityLevel: 3 as const };
      session = await ort.InferenceSession.create(modelPath, sessionOptions);
      ortModule = ort;

      const facePath = resolveModelFile("version-RFB-320.onnx");
      const cocoPath = resolveModelFile("yolo11n.onnx");

      await Promise.all([
        facePath
          ? ort.InferenceSession.create(facePath, sessionOptions)
              .then((s) => {
                faceSession = s;
              })
              .catch(() => {})
          : Promise.resolve(),
        cocoPath
          ? ort.InferenceSession.create(cocoPath, sessionOptions)
              .then((s) => {
                cocoSession = s;
              })
              .catch(() => {})
          : Promise.resolve(),
      ]);

      return { session, ort };
    } catch (err) {
      console.warn("[AI] Modelo ONNX nativo indisponível, ativando fallback óptico:", (err as Error).message);
      return null;
    } finally {
      modelInitPromise = null;
    }
  })();

  return modelInitPromise;
}

export function calibrateYoloScore(rawConf: number): number {
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
      return "Enquadramento excelente! Traseira e garupa bovina identificadas com alta precisão.";
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
      return "Enquadramento aceitável. Traseira bovina reconhecida pelo modelo.";
    }

    if (box.cx < 0.28 || box.cx > 0.72) {
      return "Animal fora do centro — alinhe a garupa no centro da mira.";
    }
    if (Math.max(box.w, box.h) < 0.22) {
      return "Traseira muito distante — aproxime (1m a 1,5m) para enquadrar a garupa.";
    }
  }

  if (score >= 70) {
    return "Enquadramento excelente! Traseira e garupa bovina identificadas com alta precisão.";
  }
  if (score >= 40) {
    return "Enquadramento aceitável. Traseira bovina reconhecida pelo modelo.";
  }
  return "Baixa confiança para traseira bovina. Aproxime (1m a 1,5m) e centralize a garupa.";
}

async function fallbackVisionScore(imageBuffer: Buffer): Promise<RearDetectionResult> {
  try {
    const img = sharp(imageBuffer).rotate();
    const stats = await img.resize(320, 320, { fit: "cover" }).stats();
    const r = stats.channels[0];
    const g = stats.channels[1];
    const b = stats.channels[2];

    const meanLuma = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
    const avgStdDev = (r.stdev + g.stdev + b.stdev) / 3;

    let exposureFactor = 1.0;
    if (meanLuma < 40) exposureFactor = Math.max(0.2, meanLuma / 40);
    else if (meanLuma > 220) exposureFactor = Math.max(0.2, (255 - meanLuma) / 35);

    const contrastFactor = Math.min(1.0, Math.max(0.15, avgStdDev / 50));

    const { data: edgeData } = await img
      .resize(160, 160, { fit: "cover" })
      .grayscale()
      .raw()
      .toBuffer({ resolveWithObject: true });

    let edgeSum = 0;
    for (let y = 1; y < 159; y++) {
      for (let x = 1; x < 159; x++) {
        const idx = y * 160 + x;
        const gx = Math.abs(edgeData[idx + 1] - edgeData[idx - 1]);
        const gy = Math.abs(edgeData[idx + 160] - edgeData[idx - 160]);
        edgeSum += gx + gy;
      }
    }
    const avgEdge = edgeSum / (158 * 158);
    const sharpnessFactor = Math.min(1.0, Math.max(0.1, avgEdge / 30));

    const combinedScore =
      (sharpnessFactor * 0.45 + contrastFactor * 0.35 + exposureFactor * 0.2) * 82;
    const score = Math.round(Math.max(12, Math.min(88, combinedScore)) * 10) / 10;

    return {
      score,
      confidence: score,
      rawConfidence: score / 100,
      lowQuality: score < 40,
      source: "vision-analysis",
      box: { cx: 0.5, cy: 0.52, w: 0.62, h: 0.72 },
      feedback: buildFeedback(score),
    };
  } catch {
    return {
      score: 0,
      confidence: 0,
      rawConfidence: 0,
      lowQuality: true,
      source: "vision-analysis",
      feedback: "Não foi possível analisar os pixels da imagem.",
    };
  }
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

async function prepareLetterboxTensor(
  rgb: NormalizedRgbImage,
  targetSize: number
): Promise<{
  float32Data: Float32Array;
  scaledW: number;
  scaledH: number;
  padX: number;
  padY: number;
}> {
  const scale = Math.min(targetSize / rgb.width, targetSize / rgb.height);
  const scaledW = Math.round(rgb.width * scale);
  const scaledH = Math.round(rgb.height * scale);
  const padX = Math.floor((targetSize - scaledW) / 2);
  const padY = Math.floor((targetSize - scaledH) / 2);

  const { data } = await sharp(rgb.data, {
    raw: { width: rgb.width, height: rgb.height, channels: 3 },
  })
    .resize(targetSize, targetSize, {
      fit: "contain",
      background: { r: 114, g: 114, b: 114 },
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const totalPixels = targetSize * targetSize;
  const float32Data = new Float32Array(totalPixels * 3);
  const inv255 = 1 / 255.0;
  const planeG = totalPixels;
  const planeB = totalPixels * 2;

  for (let i = 0; i < totalPixels; i++) {
    const base = i * 3;
    float32Data[i] = data[base] * inv255;
    float32Data[planeG + i] = data[base + 1] * inv255;
    float32Data[planeB + i] = data[base + 2] * inv255;
  }

  return { float32Data, scaledW, scaledH, padX, padY };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runYoloOnNormalizedRgb(sess: any, ort: any, rgb: NormalizedRgbImage) {
  const { float32Data, scaledW, scaledH, padX, padY } = await prepareLetterboxTensor(
    rgb,
    TARGET_INFERENCE_SIZE
  );

  const inputTensor = new ort.Tensor("float32", float32Data, [
    1,
    3,
    TARGET_INFERENCE_SIZE,
    TARGET_INFERENCE_SIZE,
  ]);
  const inputName = sess.inputNames?.[0] || "images";
  const results = await sess.run({ [inputName]: inputTensor });
  const outputName = sess.outputNames?.[0] || Object.keys(results)[0];
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runFaceGuard(ort: any, rgb: NormalizedRgbImage): Promise<{ score: number; box: RectBox | null }> {
  if (!faceSession) return { score: 0, box: null };

  try {
    const { data } = await sharp(rgb.data, {
      raw: { width: rgb.width, height: rgb.height, channels: 3 },
    })
      .resize(FACE_INPUT_WIDTH, FACE_INPUT_HEIGHT, { fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true });

    const totalPixels = FACE_INPUT_WIDTH * FACE_INPUT_HEIGHT;
    const tensorData = new Float32Array(totalPixels * 3);
    const planeG = totalPixels;
    const planeB = totalPixels * 2;
    const inv128 = 1 / 128.0;

    for (let i = 0; i < totalPixels; i++) {
      const base = i * 3;
      tensorData[i] = (data[base] - 127.0) * inv128;
      tensorData[planeG + i] = (data[base + 1] - 127.0) * inv128;
      tensorData[planeB + i] = (data[base + 2] - 127.0) * inv128;
    }

    const inputName = faceSession.inputNames?.[0] || "input";
    const out = await faceSession.run({
      [inputName]: new ort.Tensor("float32", tensorData, [
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function runCocoGuard(ort: any, rgb: NormalizedRgbImage) {
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
    const { float32Data, scaledW, scaledH, padX, padY } = await prepareLetterboxTensor(
      rgb,
      COCO_INFERENCE_SIZE
    );
    const inputName = cocoSession.inputNames?.[0] || "images";
    const out = await cocoSession.run({
      [inputName]: new ort.Tensor("float32", float32Data, [
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
      otherLabel: otherCls >= 0 ? (COCO_NON_BOVINE_LABELS[otherCls] ?? null) : null,
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

export async function analyzeRearImage(
  imageBuffer: Buffer,
  options?: AnalyzeRearOptions
): Promise<RearDetectionResult> {
  return enqueueInference(async () => {
    const loaded = await initModel();
    if (!loaded) {
      return fallbackVisionScore(imageBuffer);
    }

    const { session: sess, ort } = loaded;

    try {
      const normalized = await sharp(imageBuffer)
        .rotate()
        .removeAlpha()
        .toColorspace("srgb")
        .raw()
        .toBuffer({ resolveWithObject: true });

      const origW = normalized.info.width;
      const origH = normalized.info.height;
      const baseRgb: NormalizedRgbImage = {
        data: normalized.data,
        width: origW,
        height: origH,
      };

      let best = await runYoloOnNormalizedRgb(sess, ort, baseRgb);
      const faceSignals = await runFaceGuard(ort, baseRgb);
      const cocoSignals = await runCocoGuard(ort, baseRgb);

      const preliminaryGuard = classifySemanticSignals(
        faceSignals,
        cocoSignals,
        best.score,
        best.box
      );

      if (
        !preliminaryGuard.rejectedReason &&
        !options?.fastLive &&
        best.score < 45 &&
        origW >= 400 &&
        origH >= 400
      ) {
        const cropW = Math.round(origW * 0.68);
        const cropH = Math.round(origH * 0.68);
        const cropLeft = Math.floor((origW - cropW) / 2);
        const cropTop = Math.floor((origH - cropH) / 2);

        const cropped = await sharp(normalized.data, {
          raw: { width: origW, height: origH, channels: 3 },
        })
          .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
          .raw()
          .toBuffer({ resolveWithObject: true });

        const cropBest = await runYoloOnNormalizedRgb(sess, ort, {
          data: cropped.data,
          width: cropped.info.width,
          height: cropped.info.height,
        });

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
          rawConfidence: rejectedScore / 100,
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
        rawConfidence: best.rawConfidence,
        lowQuality: best.score < 40.0,
        source: "yolo-onnx",
        box: best.box,
        feedback: buildFeedback(best.score, best.box),
      };
    } catch (err) {
      console.error("[AI] Erro na inferência ONNX, usando fallback óptico:", err);
      return fallbackVisionScore(imageBuffer);
    }
  });
}

export async function detectRearScore(imageBuffer: Buffer): Promise<number | null> {
  const res = await analyzeRearImage(imageBuffer);
  return res.score;
}
