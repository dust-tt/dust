import type { Tool, ToolOutput } from "./types";
import { z } from "zod";

export function defineTool<I extends z.ZodType, O extends z.ZodType>(
  description: string,
  input: I,
  output: O,
  fn: (
    args: z.infer<I>,
    extra: { log: (message: string) => void }
  ) => Promise<ToolOutput<z.infer<O>>>
): Tool {
  return {
    description,
    input,
    output,
    fn: fn as Tool["fn"],
  };
}
