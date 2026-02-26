import type { Agent } from "@/types/agent";
import { get_openai_client } from "@/lib/openai";

export const response_agent: Agent<
  { data: unknown; question: string; custom_prompt?: string },
  { response: string }
> = {
  name: "Human response generator",
  purpose:
    "Takes structured data and a question. Uses AI to generate a clear, human-readable answer to the question based on the provided data.",
  action_label: "Generating human response",
  args: [
    {
      name: "data",
      format: "any (JSON-serializable)",
      purpose: "The data to use as context for answering (e.g. query results, API response).",
    },
    {
      name: "question",
      format: "string",
      purpose: "The question to answer in natural language.",
    },
  ],
  output_schema: {
    response: { description: "A human-readable answer to the question based on the data.", type: "string" },
  },
  execute: async ({ data, question, custom_prompt }) => {
    const openai = get_openai_client();
    const messages: Array<{ role: "system" | "user"; content: string }> = [
      {
        role: "system",
        content:
          "You answer the user's question using only the provided data. Be concise and clear. If the data does not contain enough information, say so.",
      },
      {
        role: "user",
        content: `Data:\n${JSON.stringify(data, null, 2)}\n\nQuestion: ${question}`,
      },
    ];
    if (custom_prompt != null && custom_prompt.trim() !== "") {
      messages.push({ role: "user", content: `Additional instructions: ${custom_prompt.trim()}` });
    }
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages,
      temperature: 0.3,
    });
    const response = completion.choices[0]?.message?.content?.trim() ?? "";
    return { response };
  },
};
