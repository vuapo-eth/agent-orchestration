import { NextResponse } from "next/server";
import { response_agent } from "@/lib/agents/response_agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { data, question } = body as { data?: unknown; question?: string };
    if (typeof question !== "string" || !question.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'question' (string)" },
        { status: 400 }
      );
    }
    const out = await response_agent.execute({
      data: data ?? null,
      question: question.trim(),
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
