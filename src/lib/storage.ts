import path from "path";
import { promises as fs } from "fs";

export const STORAGE_ROOT = path.join(process.cwd(), "storage");
export const UPLOADS_DIR = path.join(STORAGE_ROOT, "uploads");


export function resolveStoredFile(filePath: string): string | null {
  const relative = filePath.replace(/^\/?storage[\\/]?/, "");
  const absolute = path.resolve(STORAGE_ROOT, relative);
  if (!absolute.startsWith(path.resolve(STORAGE_ROOT))) return null;
  return absolute;
}

export async function ensureUploadsDir() {
  await fs.mkdir(UPLOADS_DIR, { recursive: true });
}

export async function deleteStoredFile(filePath: string) {
  const absolute = resolveStoredFile(filePath);
  if (!absolute) return;
  await fs.unlink(absolute).catch(() => {});
}
