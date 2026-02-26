import { NextResponse } from "next/server";
import { sql_agent } from "@/lib/agents/sql_agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, custom_prompt } = body as { query?: string; custom_prompt?: string };
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'query' (string)" },
        { status: 400 }
      );
    }
    const out = await sql_agent.execute({
      query: query.trim(),
      custom_prompt: typeof custom_prompt === "string" && custom_prompt.trim() !== "" ? custom_prompt.trim() : undefined,
    });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
