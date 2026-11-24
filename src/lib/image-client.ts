/**
 * Pipeline Client-Side de Compressão e Normalização de Imagens (`src/lib/image-client.ts`).
 *
 * Otimizado para envio rápido para a API e preservação da resolução e proporção:
 * - Redimensiona no cliente via Canvas HTML5 mantendo o aspect ratio original.
 * - Aceita imagens de qualquer proporção e tamanho (512x512, 4000x3000, etc.).
 * - Comprime em JPEG de alta qualidade gerando payloads leves (< 400KB).
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
 * Se cropAspect for omitido, preserva rigorosamente a proporção natural da foto.
 */
export async function compressImageFile(
  fileOrBlob: File | Blob,
  maxDimension = 2048,
  quality = 0.92,
  cropAspect?: number
): Promise<CompressedImageResult> {
  const originalSize = fileOrBlob.size;

  const computeCrop = (srcW: number, srcH: number) => {
    if (!cropAspect || cropAspect <= 0) {
      return { sx: 0, sy: 0, sw: srcW, sh: srcH };
    }
    const srcAspect = srcW / srcH;
    if (srcAspect > cropAspect) {
      const sw = srcH * cropAspect;
      const sx = (srcW - sw) / 2;
      return { sx, sy: 0, sw, sh: srcH };
    } else {
      const sh = srcW / cropAspect;
      const sy = (srcH - sh) / 2;
      return { sx: 0, sy, sw: srcW, sh };
    }
  };

  // Tenta decodificar via createImageBitmap (rápido e respeita orientação EXIF)
  if (typeof window !== "undefined" && "createImageBitmap" in window) {
    try {
      const bitmap = await createImageBitmap(fileOrBlob);
      const maxOriginal = Math.max(bitmap.width, bitmap.height);

      // Preserva JPEG original de alta resolução sem degradação dupla no Canvas
      if (
        !cropAspect &&
        fileOrBlob.type === "image/jpeg" &&
        maxOriginal > 0 &&
        maxOriginal <= maxDimension &&
        originalSize <= 3.5 * 1024 * 1024
      ) {
        const w = bitmap.width;
        const h = bitmap.height;
        bitmap.close?.();
        return {
          blob: fileOrBlob,
          width: w,
          height: h,
          originalSize,
          compressedSize: originalSize,
        };
      }

      const crop = computeCrop(bitmap.width, bitmap.height);
      const { width, height } = calculateDimensions(
        crop.sw,
        crop.sh,
        maxDimension
      );

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (ctx) {
        ctx.fillStyle = "#000000";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);
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
      // Fallback para HTMLImageElement
    }
  }

  // Fallback universal via HTMLImageElement
  return new Promise<CompressedImageResult>((resolve) => {
    const objectUrl = URL.createObjectURL(fileOrBlob);
    const img = new Image();

    img.onload = async () => {
      URL.revokeObjectURL(objectUrl);
      const nw = img.naturalWidth || img.width || 1280;
      const nh = img.naturalHeight || img.height || 960;
      const crop = computeCrop(nw, nh);

      const { width, height } = calculateDimensions(
        crop.sw,
        crop.sh,
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
      ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, width, height);

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

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
