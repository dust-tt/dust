import type { Tool, ToolContext, ToolOutput } from "./types";
import { z } from "zod";

/**
 * Helper function to define a new tool with type safety
 * 
 * @param description Description of what the tool does
 * @param input Zod schema for validating the input
 * @param output Zod schema for validating the success result
 * @param fn Implementation function
 * @returns A Tool object that can be used by the agent
 */
export function defineTool<
  TInputSchema extends z.ZodType,
  TOutputSchema extends z.ZodType
>(
  description: string,
  input: TInputSchema,
  output: TOutputSchema,
  fn: (
    args: z.infer<TInputSchema>,
    context: ToolContext
  ) => Promise<ToolOutput<z.infer<TOutputSchema>>>
): Tool<z.infer<TInputSchema>, z.infer<TOutputSchema>> {
  return {
    description,
    input,
    output,
    fn,
  };
}
