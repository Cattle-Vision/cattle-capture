/**
 * Motor Client-Side de Análise Visual em Tempo Real e Pré-Upload (`src/lib/vision-client.ts`).
 *
 * Responsabilidades:
 * 1. Projeção Geométrica da Mira (`getReticleCropCoordinates`).
 * 2. Análise Instantânea de Confiança em Tempo Real Baseada no Recorte (`computeInstantVideoScore`).
 * 3. Inferência IA Híbrida (`evaluatePhotoScoreBeforeUpload`) integrada ao backend remoto.
 */
import { getApiUrl } from "./api";
import { analyzeBlobLocally } from "./local-onnx";

export interface VisionScoreResult {
  score: number;
  confidence?: number;
  lowQuality: boolean;
  error?: boolean;
  localRuntime?: boolean;
  rejectedReason?: "human-detected" | "non-bovine-detected";
  source: "yolo-onnx" | "vision-analysis" | "client-optical";
  feedback: string;
  box?: {
    cx: number;
    cy: number;
    w: number;
    h: number;
  };
}

/**
 * Mapeia as coordenadas da marcação visual (mira HUD) da tela para os pixels reais do frame de vídeo,
 * considerando a propriedade `object-cover` e deslocamentos de renderização do elemento `<video>`.
 */
export function getReticleCropCoordinates(
  video: HTMLVideoElement,
  reticleEl?: HTMLElement | null
): { sx: number; sy: number; sw: number; sh: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return { sx: 0, sy: 0, sw: 0, sh: 0 };

  if (!reticleEl) {
    return { sx: 0, sy: 0, sw: vw, sh: vh };
  }

  const videoRect = video.getBoundingClientRect();
  const reticleRect = reticleEl.getBoundingClientRect();

  if (videoRect.width <= 0 || videoRect.height <= 0) {
    return { sx: 0, sy: 0, sw: vw, sh: vh };
  }

  const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;

  const offsetX = (videoRect.width - renderedW) / 2;
  const offsetY = (videoRect.height - renderedH) / 2;

  const screenX = reticleRect.left - videoRect.left;
  const screenY = reticleRect.top - videoRect.top;

  const rawSx = (screenX - offsetX) / scale;
  const rawSy = (screenY - offsetY) / scale;
  const rawSw = reticleRect.width / scale;
  const rawSh = reticleRect.height / scale;

  const sx = Math.max(0, Math.min(vw - 20, rawSx));
  const sy = Math.max(0, Math.min(vh - 20, rawSy));
  const sw = Math.max(20, Math.min(vw - sx, rawSw));
  const sh = Math.max(20, Math.min(vh - sy, rawSh));

  return { sx, sy, sw, sh };
}

/**
 * Calcula a região recomendada de captura no vídeo (`sx, sy, sw, sh`) alinhada ao que
 * o operador realmente vê na tela (`object-cover` + margem de segurança de ~35% ao redor da mira).
 *
 * Por que isso melhora o enquadramento da IA:
 * Em celulares na vertical, o sensor da câmera costuma entregar 16:9 horizontal (ex.: 1920x1080)
 * enquanto `<video class="object-cover">` mostra apenas a faixa central. Sem este recorte,
 * paredes/curral fora da tela entram na foto, reduzindo a traseira do animal no tensor 640x640 do YOLO.
 */
export function getFramingCaptureRect(
  video: HTMLVideoElement,
  reticleEl?: HTMLElement | null
): { sx: number; sy: number; sw: number; sh: number } {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return { sx: 0, sy: 0, sw: 0, sh: 0 };

  const videoRect = video.getBoundingClientRect();
  if (videoRect.width <= 0 || videoRect.height <= 0) {
    return { sx: 0, sy: 0, sw: vw, sh: vh };
  }

  // Área visível na tela após `object-cover`
  const scale = Math.max(videoRect.width / vw, videoRect.height / vh);
  const renderedW = vw * scale;
  const renderedH = vh * scale;
  const offsetX = (videoRect.width - renderedW) / 2;
  const offsetY = (videoRect.height - renderedH) / 2;

  const visSx = Math.max(0, -offsetX / scale);
  const visSy = Math.max(0, -offsetY / scale);
  const visSw = Math.min(vw - visSx, videoRect.width / scale);
  const visSh = Math.min(vh - visSy, videoRect.height / scale);

  if (!reticleEl) {
    return {
      sx: Math.round(visSx),
      sy: Math.round(visSy),
      sw: Math.max(64, Math.round(visSw)),
      sh: Math.max(64, Math.round(visSh)),
    };
  }

  const reticle = getReticleCropCoordinates(video, reticleEl);
  if (reticle.sw <= 0 || reticle.sh <= 0) {
    return {
      sx: Math.round(visSx),
      sy: Math.round(visSy),
      sw: Math.max(64, Math.round(visSw)),
      sh: Math.max(64, Math.round(visSh)),
    };
  }

  // Expande a mira com margem anatômica proporcional (evita distorção excessiva entre
  // webcams landscape 16:9 de PC e câmeras portrait 9:16 de celular), preservando os limites visíveis.
  const cx = reticle.sx + reticle.sw / 2;
  const cy = reticle.sy + reticle.sh / 2;
  const paddedW = Math.min(visSw, Math.max(reticle.sw * 1.48, reticle.sh * 1.12));
  const paddedH = Math.min(visSh, Math.max(reticle.sh * 1.38, reticle.sw * 1.18));

  let sx = cx - paddedW / 2;
  let sy = cy - paddedH / 2;
  sx = Math.max(visSx, Math.min(visSx + visSw - paddedW, sx));
  sy = Math.max(visSy, Math.min(visSy + visSh - paddedH, sy));

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.max(64, Math.round(paddedW)),
    sh: Math.max(64, Math.round(paddedH)),
  };
}

/**
 * Calcula métricas ópticas instantâneas diretamente da REGIÃO RECORTADA pela mira do `<video>`
 * para orientar iluminação e foco sem bloquear o preview em tempo real.
 */
export function computeInstantVideoScore(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement,
  reticleEl?: HTMLElement | null
): { score: number; statusText: string } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const { sx, sy, sw, sh } = getReticleCropCoordinates(video, reticleEl);
  if (sw <= 0 || sh <= 0) return null;

  const SIZE = 64;
  scratchCanvas.width = SIZE;
  scratchCanvas.height = SIZE;
  const ctx = scratchCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, SIZE, SIZE);
  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

  let sumLuma = 0;
  let sumLumaSq = 0;
  let edgeEnergy = 0;
  let centerContrast = 0;
  const totalPixels = SIZE * SIZE;

  const luma = new Float32Array(totalPixels);
  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    const y = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
    luma[i] = y;
    sumLuma += y;
    sumLumaSq += y * y;
  }

  const mean = sumLuma / totalPixels;
  const variance = Math.max(0, sumLumaSq / totalPixels - mean * mean);
  const stdDev = Math.sqrt(variance);

  const margin = 10;
  const centerStart = 16;
  const centerEnd = 48;
  let centerCount = 0;
  for (let y = margin; y < SIZE - margin; y++) {
    for (let x = margin; x < SIZE - margin; x++) {
      const i = y * SIZE + x;
      const gx = Math.abs(luma[i + 1] - luma[i - 1]);
      const gy = Math.abs(luma[i + SIZE] - luma[i - SIZE]);
      edgeEnergy += gx + gy;
      if (x >= centerStart && x <= centerEnd && y >= centerStart && y <= centerEnd) {
        centerContrast += Math.abs(luma[i] - mean);
        centerCount++;
      }
    }
  }

  const innerPixels = (SIZE - margin * 2) * (SIZE - margin * 2);
  const avgEdge = edgeEnergy / innerPixels;
  const avgCenterDiff = centerContrast / Math.max(1, centerCount);

  let lightFactor = 1.0;
  if (mean < 32) lightFactor = Math.max(0.2, mean / 32);
  else if (mean > 228) lightFactor = Math.max(0.25, (255 - mean) / 27);

  const sharpnessScore = Math.min(1, avgEdge / 26);
  const contrastScore = Math.min(1, stdDev / 48);
  const subjectScore = Math.min(1, avgCenterDiff / 28);

  // Avaliação puramente óptica fica limitada a 72% para nunca iludir com "96% ideal" sem detecção do modelo
  const raw =
    (sharpnessScore * 0.45 + contrastScore * 0.3 + subjectScore * 0.25) *
    lightFactor *
    72;
  const score = Math.round(Math.max(8, Math.min(72, raw)));

  let statusText = "Centralize a garupa na mira";
  if (mean < 35) statusText = "Ambiente muito escuro";
  else if (mean > 228) statusText = "Excesso de luz / contraluz";
  else if (avgEdge < 9) statusText = "Imagem desfocada / sem nitidez";
  else if (score >= 52) statusText = "Iluminação e nitidez boas";

  return { score, statusText };
}

/**
 * Avalia a Confiança de Enquadramento de um Blob de imagem ANTES do envio:
 * 1. Prioridade absoluta (Edge AI Local): executa `identifier.onnx`, `version-RFB-320.onnx` e
 *    `yolo11n.onnx` diretamente no dispositivo do usuário (100% funcional offline, zero latência de rede).
 * 2. Fallback remoto: apenas caso o navegador não suporte WebAssembly/ONNX e haja internet.
 */
export async function evaluatePhotoScoreBeforeUpload(
  blob: Blob,
  signal?: AbortSignal,
  mode: "live" | "full" = "full"
): Promise<VisionScoreResult> {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }

  try {
    const localResult = await analyzeBlobLocally(blob, mode);
    if (signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    if (localResult) {
      return { ...localResult, localRuntime: true };
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw err;
    }
  }

  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      score: 0,
      lowQuality: true,
      error: true,
      localRuntime: true,
      source: "client-optical",
      feedback: "IA local indisponível neste navegador no modo offline.",
    };
  }

  try {
    const fd = new FormData();
    fd.append("file", blob, "frame.jpg");

    const baseUrl = getApiUrl();
    const qs = mode === "live" ? "?mode=live" : "";
    const res = await fetch(`${baseUrl}/api/photos/score${qs}`, {
      method: "POST",
      body: fd,
      signal,
    });

    if (res.ok) {
      const data = (await res.json()) as VisionScoreResult;
      if (typeof data.score === "number") {
        return { ...data, localRuntime: false };
      }
    }
  } catch (err) {
    if ((err as Error)?.name === "AbortError") {
      throw err;
    }
  }

  return {
    score: 0,
    lowQuality: true,
    error: true,
    source: "client-optical",
    feedback: "Não foi possível analisar a imagem agora — tente novamente.",
  };
}
