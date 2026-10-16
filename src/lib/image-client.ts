/**
 * Pipeline Client-Side de Compressão e Normalização de Imagens (`src/lib/image-client.ts`).
 *
 * Por que este módulo é crítico para o funcionamento na Vercel:
 * - Smartphones modernos geram fotos de 5 MB a 18 MB (resoluções 4000x3000+ ou HEIC/PNG).
 * - As Serverless Functions da Vercel possuem limite rígido de 4.5 MB no corpo da requisição
 *   (`413 FUNCTION_PAYLOAD_TOO_LARGE`).
 * - Este utilitário redimensiona qualquer arquivo (`File` ou `Blob`) no navegador via HTML5 Canvas
 *   para no máximo `1600px` no maior lado e codifica em JPEG (`quality: 0.86`), gerando arquivos
 *   leves (~150 KB a 450 KB) que são enviados em menos de 1 segundo mesmo em redes móveis rurais (3G/4G).
 */

export interface CompressedImageResult {
  blob: Blob;
  width: number;
  height: number;
  originalSize: number;
  compressedSize: number;
}

/**
 * Redimensiona e comprime qualquer arquivo de imagem no cliente para JPEG otimizado.
 */
export async function compressImageFile(
  fileOrBlob: File | Blob,
  maxDimension = 1600,
  quality = 0.86
): Promise<CompressedImageResult> {
  const originalSize = fileOrBlob.size;

  // Tenta decodificar via createImageBitmap (rápido e respeita orientação EXIF nos browsers modernos)
  if (typeof window !== "undefined" && "createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(fileOrBlob);
      const { width, height } = calculateDimensions(
        bitmap.width,
        bitmap.height,
        maxDimension
      );

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close?.();

        const outBlob = await canvasToJpegBlob(canvas, quality);
        if (outBlob) {
          return {
            blob: outBlob,
            width,
            height,
            originalSize,
            compressedSize: outBlob.size,
          };
        }
      }
      bitmap.close?.();
    } catch {
      // Fallback para HTMLImageElement abaixo
    }
  }

  // Fallback universal via HTMLImageElement + ObjectURL
  return new Promise<CompressedImageResult>((resolve) => {
    const objectUrl = URL.createObjectURL(fileOrBlob);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const { width, height } = calculateDimensions(
        img.naturalWidth || img.width || 1280,
        img.naturalHeight || img.height || 960,
        maxDimension
      );

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });

      if (!ctx) {
        resolve({
          blob: fileOrBlob,
          width,
          height,
          originalSize,
          compressedSize: fileOrBlob.size,
        });
        return;
      }

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      const outBlob = await canvasToJpegBlob(canvas, quality);
      if (!outBlob) {
        resolve({
          blob: fileOrBlob,
          width,
          height,
          originalSize,
          compressedSize: fileOrBlob.size,
        });
        return;
      }

      resolve({
        blob: outBlob,
        width,
        height,
        originalSize,
        compressedSize: outBlob.size,
      });
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({
        blob: fileOrBlob,
        width: 0,
        height: 0,
        originalSize,
        compressedSize: fileOrBlob.size,
      });
    };

    img.src = objectUrl;
  });
}

function calculateDimensions(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number
): { width: number; height: number } {
  let width = srcWidth;
  let height = srcHeight;

  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

function canvasToJpegBlob(
  canvas: HTMLCanvasElement,
  quality: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Formata bytes em string legível (KB / MB).
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
