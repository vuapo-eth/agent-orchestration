import type { Agent } from "@/types/agent";
import { get_openai_client } from "@/lib/openai";

export const response_agent: Agent<
  { data: unknown; question: string },
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
  execute: async ({ data, question }) => {
    const openai = get_openai_client();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content:
            "You answer the user's question using only the provided data. Be concise and clear. If the data does not contain enough information, say so.",
        },
        {
          role: "user",
          content: `Data:\n${JSON.stringify(data, null, 2)}\n\nQuestion: ${question}`,
        },
      ],
      temperature: 0.3,
    });
    const response = completion.choices[0]?.message?.content?.trim() ?? "";
    return { response };
  },
};
