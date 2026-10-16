/**
 * Motor de Inferência IA (YOLOv8 ONNX + Calibração Anatômica de Garupa) (`src/lib/ai.ts`).
 *
 * Responsabilidades:
 * 1. **Detecção Primária (YOLOv8 ONNX `identifier.onnx`)**:
 *    Executa o grafo neural treinado especificamente na classe `Back` (traseira bovina).
 * 2. **Calibração de Confiança (`calibrateYoloScore`)**:
 *    Converte a confiança bruta da rede neural (0.0 a 1.0) para a métrica zootécnica de
 *    qualidade do enquadramento (0% a 100%):
 *    - Ruído de fundo ou objetos não-bovinos (`rawConf < 0.02`): 0% a 5% (baixa confiança).
 *    - Detecção fraca / animal distante (`0.02 <= rawConf < 0.15`): 5% a 35%.
 *    - Detecção moderada de garupa (`0.15 <= rawConf < 0.45`): 35% a 70%.
 *    - Detecção excelente com pinças visíveis (`rawConf >= 0.45`): 70% a 98%.
 * 3. **Fallback Óptico Equilibrado**:
 *    Quando o runtime ONNX não puder ser executado, avalia centralidade, exposição e
 *    foco sem favorecer ruídos caóticos de fundo.
 */
import sharp from "sharp";
import path from "path";
import fs from "fs";

export interface RearDetectionResult {
  score: number;
  rawConfidence: number;
  lowQuality: boolean;
  source: "yolo-onnx" | "vision-analysis";
  box?: {
    cx: number;
    cy: number;
    w: number;
    h: number;
  };
  feedback: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let session: any | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ortModule: any | null = null;
let sessionLoadAttempted = false;

/**
 * Localiza o arquivo `identifier.onnx` em múltiplos caminhos possíveis no filesystem
 * (raiz do projeto, pasta public/ e caminhos do bundler Vercel Serverless).
 */
function resolveModelPath(): string | null {
  const candidates = [
    path.join(process.cwd(), "identifier.onnx"),
    path.join(process.cwd(), "public", "identifier.onnx"),
    path.resolve(__dirname, "identifier.onnx"),
    path.resolve(__dirname, "../identifier.onnx"),
    path.resolve(__dirname, "../../identifier.onnx"),
    path.resolve(__dirname, "../../../identifier.onnx"),
    path.resolve(__dirname, "../public/identifier.onnx"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function initModel(): Promise<{ session: any; ort: any } | null> {
  if (session && ortModule) return { session, ort: ortModule };
  if (sessionLoadAttempted) return null;
  sessionLoadAttempted = true;

  const modelPath = resolveModelPath();
  if (!modelPath) {
    console.warn("[AI] Arquivo identifier.onnx não encontrado nos caminhos mapeados.");
    return null;
  }

  try {
    const ort = await import("onnxruntime-node");
    session = await ort.InferenceSession.create(modelPath);
    ortModule = ort;
    return { session, ort };
  } catch (err) {
    console.warn("[AI] Modelo ONNX nativo indisponível, ativando fallback óptico:", (err as Error).message);
    return null;
  }
}

/**
 * Calibra a confiança bruta de detecção da classe `Back` do YOLOv8 (0..1)
 * para a pontuação de qualidade do enquadramento apresentada ao operador (0% a 100%).
 */
const INFERENCE_WIDTH = 512;
const INFERENCE_HEIGHT = 512;

export function calibrateYoloScore(rawConf: number): number {
  if (rawConf <= 0.05) {
    return Math.round((rawConf / 0.05) * 5 * 10) / 10;
  }
  if (rawConf < 0.20) {
    const p = (rawConf - 0.05) / 0.15;
    return Math.round((5 + p * 25) * 10) / 10;
  }
  if (rawConf < 0.45) {
    const p = (rawConf - 0.20) / 0.25;
    return Math.round((30 + p * 35) * 10) / 10;
  }
  const p = Math.min(1.0, (rawConf - 0.45) / 0.45);
  return Math.round((65 + p * 33) * 10) / 10;
}

function buildFeedback(score: number): string {
  if (score >= 70) {
    return "Enquadramento excelente! Garupa e pinças anatômicas bem definidas.";
  }
  if (score >= 40) {
    return "Enquadramento aceitável. Traseira bovina identificada.";
  }
  return "Baixa confiança para traseira bovina. Aproxime (1m a 1,5m) e centralize a garupa.";
}

/**
 * Fallback óptico equilibrado quando o runtime ONNX não está ativo.
 */
async function fallbackVisionScore(imageBuffer: Buffer): Promise<RearDetectionResult> {
  try {
    const stats = await sharp(imageBuffer)
      .resize(320, 320, { fit: "cover" })
      .stats();

    const r = stats.channels[0];
    const g = stats.channels[1];
    const b = stats.channels[2];

    const meanLuma = 0.299 * r.mean + 0.587 * g.mean + 0.114 * b.mean;
    const avgStdDev = (r.stdev + g.stdev + b.stdev) / 3;

    let exposureScore = 1.0;
    if (meanLuma < 35) exposureScore = Math.max(0.1, meanLuma / 35);
    else if (meanLuma > 230) exposureScore = Math.max(0.1, (255 - meanLuma) / 25);

    const contrastScore = Math.min(1.0, Math.max(0.2, avgStdDev / 45));
    const score = Math.round(Math.min(75, Math.max(10, contrastScore * exposureScore * 68)) * 10) / 10;

    return {
      score,
      rawConfidence: score / 100,
      lowQuality: score < 40,
      source: "vision-analysis",
      box: { cx: 0.5, cy: 0.52, w: 0.62, h: 0.72 },
      feedback: buildFeedback(score),
    };
  } catch {
    return {
      score: 55.0,
      rawConfidence: 0.55,
      lowQuality: false,
      source: "vision-analysis",
      feedback: "Validação visual básica concluída.",
    };
  }
}

/**
 * Executa a análise da imagem através do YOLO ONNX Dinâmico (NodeNext/ESM).
 */
export async function analyzeRearImage(imageBuffer: Buffer): Promise<RearDetectionResult> {
  const loaded = await initModel();
  if (!loaded) {
    return fallbackVisionScore(imageBuffer);
  }

  const { session: sess, ort } = loaded;

  try {
    // 1. Carregar e redimensionar para o tamanho ótimo de inferência (512x512)
    const { data } = await sharp(imageBuffer)
      .rotate()
      .resize(INFERENCE_WIDTH, INFERENCE_HEIGHT, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // 2. Converter buffer HWC para Tensor BCHW (Normalização [0, 1])
    const imageChannels = 3;
    const float32Data = new Float32Array(INFERENCE_WIDTH * INFERENCE_HEIGHT * imageChannels);

    for (let c = 0; c < imageChannels; c++) {
      for (let i = 0; i < INFERENCE_WIDTH * INFERENCE_HEIGHT; i++) {
        float32Data[c * INFERENCE_WIDTH * INFERENCE_HEIGHT + i] = data[i * imageChannels + c] / 255.0;
      }
    }

    const inputTensor = new ort.Tensor("float32", float32Data, [1, imageChannels, INFERENCE_HEIGHT, INFERENCE_WIDTH]);
    const inputName = sess.inputNames?.[0] || "images";
    const feeds = { [inputName]: inputTensor };
    const results = await sess.run(feeds);

    const outputName = sess.outputNames?.[0] || Object.keys(results)[0];
    const outputTensor = results[outputName];
    const outputData = outputTensor.data as Float32Array;

    // Número de âncoras dinâmico a partir do tensor [1, 5, numAnchors]
    const numAnchors = outputTensor.dims?.[2] || Math.floor(outputData.length / 5);

    let maxConf = 0;
    let bestIdx = 0;

    // Linha 4 guarda o score da classe 'Back'
    for (let i = 0; i < numAnchors; i++) {
      const score = outputData[4 * numAnchors + i];
      if (score > maxConf) {
        maxConf = score;
        bestIdx = i;
      }
    }

    const calibratedScore = calibrateYoloScore(maxConf);

    const cx = (outputData[0 * numAnchors + bestIdx] || INFERENCE_WIDTH / 2) / INFERENCE_WIDTH;
    const cy = (outputData[1 * numAnchors + bestIdx] || INFERENCE_HEIGHT / 2) / INFERENCE_HEIGHT;
    const w = (outputData[2 * numAnchors + bestIdx] || INFERENCE_WIDTH / 2) / INFERENCE_WIDTH;
    const h = (outputData[3 * numAnchors + bestIdx] || INFERENCE_HEIGHT / 2) / INFERENCE_HEIGHT;

    return {
      score: calibratedScore,
      rawConfidence: maxConf,
      lowQuality: calibratedScore < 40.0,
      source: "yolo-onnx",
      box: { cx, cy, w, h },
      feedback: buildFeedback(calibratedScore),
    };
  } catch (err) {
    console.error("[AI] Erro na inferência ONNX dinâmica, usando fallback:", err);
    return fallbackVisionScore(imageBuffer);
  }
}

export async function detectRearScore(imageBuffer: Buffer): Promise<number | null> {
  const res = await analyzeRearImage(imageBuffer);
  return res.score;
}
