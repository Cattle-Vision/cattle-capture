import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { promises as fs } from "fs";
import path from "path";
import { STORAGE_ROOT } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const { path: segments } = await params;
    const relativePath = segments.join("/");
    const absolutePath = path.resolve(STORAGE_ROOT, relativePath);
    const root = path.resolve(STORAGE_ROOT);
    if (!absolutePath.startsWith(root)) {
      return NextResponse.json({ error: "Proibido" }, { status: 403 });
    }

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(absolutePath);
    } catch {
      return NextResponse.json({ error: "Arquivo não encontrado" }, { status: 404 });
    }

    const ext = path.extname(relativePath).toLowerCase();
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
    };
    const contentType = contentTypeMap[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(fileBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("[storage] Erro ao servir arquivo:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
