import { NextResponse } from "next/server";
import { sql_agent } from "@/lib/agents/sql_agent";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body as { query?: string };
    if (typeof query !== "string" || !query.trim()) {
      return NextResponse.json(
        { error: "Missing or invalid 'query' (string)" },
        { status: 400 }
      );
    }
    const out = await sql_agent.execute({ query: query.trim() });
    return NextResponse.json(out);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
