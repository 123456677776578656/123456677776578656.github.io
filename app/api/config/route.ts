import { NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()) },
    { headers: { "Cache-Control": "no-store" } },
  );
}
