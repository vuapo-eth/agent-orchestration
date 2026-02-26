import { NextResponse } from "next/server";
import { js_processor_agent } from "@/lib/agents/js_processor_agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { instruction, data, custom_prompt } = body as { instruction?: string; data?: unknown; custom_prompt?: string };
    if (typeof instruction !== "string" || !instruction.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'instruction' (string)" },
        { status: 400 }
      );
    }
    const out = await js_processor_agent.execute({
      instruction: instruction.trim(),
      data: data ?? null,
      custom_prompt: typeof custom_prompt === "string" && custom_prompt.trim() !== "" ? custom_prompt.trim() : undefined,
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
