import type { Agent } from "@/types/agent";
import { get_openai_client } from "@/lib/openai";
import { vm } from "node:vm";

export const js_processor_agent: Agent<
  { instruction: string; data: unknown },
  { result: unknown }
> = {
  name: "JS data processor",
  purpose:
    "Takes an instruction and a data payload. Uses AI to generate JavaScript code that processes the data according to the instruction, then runs the code in a sandbox and returns the result.",
  action_label: "Processing data with JavaScript",
  args: [
    {
      name: "instruction",
      format: "string",
      purpose: "What to do with the data (e.g. 'filter items where status is active and sort by date').",
    },
    {
      name: "data",
      format: "any (JSON-serializable)",
      purpose: "The data to process. Will be available as `data` in the generated code.",
    },
  ],
  output_schema: {
    result: { description: "The value returned by the generated script.", type: "any" },
  },
  execute: async ({ instruction, data }) => {
    const openai = get_openai_client();
    const completion = await openai.chat.completions.create({
      model: "gpt-5.2",
      messages: [
        {
          role: "system",
          content: `You are a JavaScript code generator. The user will provide an instruction and a \`data\` payload. Your code will run in a sandbox with \`data\` already in scope. Your code must assign the final value to a variable named \`result\`. Use only plain JavaScript (no require/import, no Node APIs). Return ONLY the code, no markdown or explanation. Example: "filter to active" -> result = data.filter(x => x.status === 'active');`,
        },
        {
          role: "user",
          content: `Instruction: ${instruction}\n\nData (first 500 chars): ${JSON.stringify(data).slice(0, 500)}`,
        },
      ],
      temperature: 0,
    });
    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const code = raw.replace(/^```\w*\n?|\n?```$/g, "").trim();
    const wrapped = `const data = ${JSON.stringify(data)}; ${code}; result;`;
    const context = vm.createContext({ result: undefined });
    const run = new vm.Script(wrapped);
    const result = run.runInNewContext(context, { timeout: 5000 });
    return { result };
  },
};
