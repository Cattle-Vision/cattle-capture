/**
 * Motor Híbrido de Armazenamento e Otimização de Imagens (`src/lib/storage.ts`).
 *
 * Por que esta arquitetura resolve definitivamente os problemas na Vercel:
 * 1. **Otimização Server-Side (`optimizeImageBuffer`)**:
 *    Normaliza qualquer imagem recebida (corrige orientação EXIF de celulares,
 *    redimensiona para no máximo 1600x1600px mantendo proporção e comprime em JPEG
 *    progressivo com qualidade 82%). Reduz fotos de vários megabytes para ~120–280 KB.
 * 2. **Upload Resiliente Multi-Camada (`storePhotoBuffer`)**:
 *    - Camada 1: Tenta enviar ao `@vercel/blob` com `access: "private"` e `addRandomSuffix: true`.
 *    - Camada 2: Se o Blob Store da Vercel estiver configurado como `public` (erro `BlobAccessError`),
 *      repete automaticamente com `access: "public"`.
 *    - Camada 3 (Fallback Serverless Zero-Failure): Se os tokens do Vercel Blob (`BLOB_READ_WRITE_TOKEN`
 *      ou `VERCEL_OIDC_TOKEN` + `BLOB_STORE_ID`) estiverem ausentes, expirados em ambiente dev ou
 *      indisponíveis, armazena o JPEG otimizado diretamente como Data URI (`data:image/jpeg;base64,...`)
 *      na coluna `TEXT` do PostgreSQL.
 * 3. **Leitura Autenticada Universal (`readPhotoBuffer`)**:
 *    - Decodifica Data URIs instantaneamente em memória.
 *    - Para URLs do Vercel Blob (`.blob.vercel-storage.com`), utiliza o método oficial
 *      `get(url, { access: "private" | "public" })` do SDK `@vercel/blob`, que injeta o
 *      header `Authorization: Bearer <token>` exigido por stores privados (resolvendo o erro 403).
 *    - Suporta leitura de arquivos locais legados em `/storage/uploads/*`.
 */
import path from "path";
import { promises as fs } from "fs";
import sharp from "sharp";
import { put, get, del } from "@vercel/blob";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");

/**
 * Gera um nome de arquivo seguro e padronizado para a imagem JPEG.
 */
export function safeJpegName(tag: string): string {
  const slug = tag.replace(/[^A-Z0-9\-_.]/gi, "_").toUpperCase() || "ANIMAL";
  return `cattle/${slug}_${Date.now()}.jpg`;
}

/**
 * Otimiza e padroniza o buffer de imagem para JPEG leve (máx 1600px, ~150KB).
 * Caso o binário do `sharp` não esteja disponível, retorna o buffer original sem interromper o fluxo.
 */
export async function optimizeImageBuffer(inputBuffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(inputBuffer)
      .rotate() // Aplica rotação automática baseada nos metadados EXIF da câmera do celular
      .resize(1600, 1600, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 82,
        mozjpeg: true,
      })
      .toBuffer();
  } catch (err) {
    console.warn("[storage] Falha ao otimizar com sharp, usando buffer original:", (err as Error).message);
    return inputBuffer;
  }
}

/**
 * Verifica se há credenciais configuradas para o Vercel Blob no ambiente atual.
 */
function hasVercelBlobCredentials(): boolean {
  const hasReadWrite = Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
  const hasOidc =
    Boolean(process.env.VERCEL_OIDC_TOKEN?.trim()) &&
    Boolean(process.env.BLOB_STORE_ID?.trim());
  return hasReadWrite || hasOidc || process.env.VERCEL === "1";
}

/**
 * Salva a foto otimizada no Vercel Blob (privado ou público) com fallback automático
 * para Data URI no banco PostgreSQL caso o Blob Store não esteja acessível.
 */
export async function storePhotoBuffer(
  tag: string,
  rawBuffer: Buffer
): Promise<{ filePath: string; optimizedBuffer: Buffer; storageType: "vercel-blob" | "database-inline" }> {
  const optimizedBuffer = await optimizeImageBuffer(rawBuffer);
  const pathname = safeJpegName(tag);

  if (hasVercelBlobCredentials()) {
    // Tentativa 1: Store Privado (configuração padrão do store_zPZh2RYVHf5E0iyd)
    try {
      const blob = await put(pathname, optimizedBuffer, {
        access: "private",
        contentType: "image/jpeg",
        addRandomSuffix: true,
      });
      return {
        filePath: blob.url,
        optimizedBuffer,
        storageType: "vercel-blob",
      };
    } catch (privateErr) {
      const msg = (privateErr as Error)?.message || "";
      console.warn("[storage] Tentativa private blob falhou:", msg);

      // Tentativa 2: Caso o store na Vercel tenha sido alterado para Public
      if (msg.toLowerCase().includes("public") || msg.toLowerCase().includes("access")) {
        try {
          const pubBlob = await put(pathname, optimizedBuffer, {
            access: "public",
            contentType: "image/jpeg",
            addRandomSuffix: true,
          });
          return {
            filePath: pubBlob.url,
            optimizedBuffer,
            storageType: "vercel-blob",
          };
        } catch (pubErr) {
          console.warn("[storage] Tentativa public blob também falhou:", (pubErr as Error)?.message);
        }
      }
    }
  }

  // Fallback Serverless Universal: Data URI base64 armazenado diretamente no PostgreSQL (TEXT)
  const base64DataUri = `data:image/jpeg;base64,${optimizedBuffer.toString("base64")}`;
  return {
    filePath: base64DataUri,
    optimizedBuffer,
    storageType: "database-inline",
  };
}

/**
 * Recupera os bytes binários e o Content-Type de uma foto independentemente
 * de onde ela foi armazenada (Vercel Blob Privado, Vercel Blob Público, Data URI ou Disco Local).
 */
export async function readPhotoBuffer(
  filePath: string
): Promise<{ buffer: Buffer; contentType: string } | null> {
  if (!filePath) return null;

  // 1. Data URI embutido no banco (`data:image/jpeg;base64,...`)
  if (filePath.startsWith("data:")) {
    const match = filePath.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    return {
      contentType: match[1] || "image/jpeg",
      buffer: Buffer.from(match[2], "base64"),
    };
  }

  // 2. URL do Vercel Blob Storage (`https://...blob.vercel-storage.com/...`)
  if (filePath.includes(".blob.vercel-storage.com")) {
    const isPrivateUrl = filePath.includes(".private.blob.vercel-storage.com");
    const primaryAccess = isPrivateUrl ? "private" : "public";
    const secondaryAccess = isPrivateUrl ? "public" : "private";

    for (const accessMode of [primaryAccess, secondaryAccess] as const) {
      try {
        const result = await get(filePath, { access: accessMode });
        if (result && result.statusCode === 200 && result.stream) {
          const arrayBuffer = await new Response(result.stream as unknown as ReadableStream).arrayBuffer();
          return {
            buffer: Buffer.from(arrayBuffer),
            contentType: result.blob.contentType || "image/jpeg",
          };
        }
      } catch {
        // Continua para o próximo método de leitura
      }
    }

    // Fallback fetch direto (para blobs públicos quando sem token OIDC local)
    try {
      const res = await fetch(filePath);
      if (res.ok) {
        const arrayBuffer = await res.arrayBuffer();
        return {
          buffer: Buffer.from(arrayBuffer),
          contentType: res.headers.get("content-type") || "image/jpeg",
        };
      }
    } catch {
      return null;
    }

    return null;
  }

  // 3. Outras URLs HTTP/HTTPS externas
  if (filePath.startsWith("http://") || filePath.startsWith("https://")) {
    try {
      const res = await fetch(filePath);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      return {
        buffer: Buffer.from(arrayBuffer),
        contentType: res.headers.get("content-type") || "image/jpeg",
      };
    } catch {
      return null;
    }
  }

  // 4. Armazenamento local legado (`/storage/uploads/...`)
  const localPath = resolveStoredFile(filePath);
  if (!localPath) return null;
  try {
    const buffer = await fs.readFile(localPath);
    return { buffer, contentType: "image/jpeg" };
  } catch {
    return null;
  }
}

export function resolveStoredFile(filePath: string): string | null {
  if (filePath.startsWith("data:") || filePath.startsWith("http")) return null;
  const relative = filePath.replace(/^\/?storage[\\/]?/, "");
  const absolute = path.resolve(STORAGE_ROOT, relative);
  if (!absolute.startsWith(path.resolve(STORAGE_ROOT))) return null;
  return absolute;
}

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true }).catch(() => {});
}

export async function deleteStoredFile(filePath: string) {
  if (!filePath || filePath.startsWith("data:")) return;

  if (filePath.includes(".blob.vercel-storage.com")) {
    await del(filePath).catch(() => {});
    return;
  }

  const absolute = resolveStoredFile(filePath);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => {});
}
