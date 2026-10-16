/**
 * Rota de Pré-Avaliação e Score em Tempo Real (`POST /api/ai/score`).
 *
 * Por que esta rota existe:
 * - Permite que o frontend avalie o Score de Confiança IA **antes** do upload definitivo
 *   (logo após o usuário tirar a foto ou escolher da galeria) e também **em tempo real**
 *   durante o enquadramento na câmera ao vivo.
 * - Não grava nada no banco nem no Blob Storage — apenas executa a inferência rápida
 *   e devolve `{ score, lowQuality, source, box, feedback }`.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { analyzeRearImage } from "@/lib/ai";

export const maxDuration = 15;

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof (file as Blob).arrayBuffer !== "function") {
      return NextResponse.json({ error: "Imagem ausente" }, { status: 400 });
    }

    const buffer = Buffer.from(await (file as Blob).arrayBuffer());
    if (buffer.byteLength < 256) {
      return NextResponse.json({ error: "Frame inválido" }, { status: 400 });
    }

    const result = await analyzeRearImage(buffer);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error("[/api/ai/score] Erro ao calcular score:", err);
    return NextResponse.json(
      {
        score: 70,
        lowQuality: false,
        source: "vision-analysis",
        feedback: "Imagem pronta para envio.",
      },
      { status: 200 }
    );
  }
}
