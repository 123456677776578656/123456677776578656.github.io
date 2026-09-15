import { NextResponse } from "next/server";
import { GEMINI_MODEL } from "../../../lib/ai-config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()), model: GEMINI_MODEL },
    { headers: { "Cache-Control": "no-store" } },
  );
}
