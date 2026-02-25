import OpenAI from "openai";

export function get_openai_client(): OpenAI {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return new OpenAI({ apiKey: key });
}

export async function openai_json<T>(params: {
  model: string;
  messages: OpenAI.Chat.ChatCompletionMessageParam[];
  temperature?: number;
  validate: (parsed: unknown) => asserts parsed is T;
}): Promise<T> {
  const openai = get_openai_client();
  const completion = await openai.chat.completions.create({
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0,
  });
  const raw = completion.choices[0]?.message?.content?.trim() ?? "";
  const cleaned = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`OpenAI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
  params.validate(parsed);
  return parsed;
}
