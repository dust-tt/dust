import type { Tool } from "./types";
import { z } from "zod";

export function defineTool<I extends z.ZodType<any>, O extends z.ZodType<any>>(
  description: string,
  input: I,
  output: O,
  implementation: (args: z.infer<I>) => Promise<z.infer<O> | null>
): Tool {
  return {
    description,
    input,
    output,
    fn: implementation,
  };
}
