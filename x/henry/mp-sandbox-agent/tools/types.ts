import { z } from "zod";

/**
 * Utility to provide logging and other functionality to tool executions
 */
export interface ToolContext {
  /** Function to log information during tool execution */
  log: (message: string) => void;
}

/**
 * Represents a tool that can be used by the agent
 */
export interface Tool<TInput = unknown, TOutput = unknown> {
  /** The function that implements the tool's behavior */
  fn: (
    input: TInput,
    context: ToolContext
  ) => Promise<ToolOutput<TOutput>>;
  /** Schema for validating and parsing the input */
  input: z.ZodType<TInput>;
  /** Schema for validating and parsing the output */
  output: z.ZodType<TOutput>;
  /** Description of what the tool does */
  description: string;
}

/**
 * Type-erased Tool for internal use when specific type information is not needed
 */
export type AnyTool = Tool<unknown, unknown>;

/**
 * Creates a Zod schema for validating tool outputs
 * @param valueSchema Schema for the success result
 * @returns A union schema that can validate either success or error results
 */
export const ToolOutput = <T extends z.ZodType>(valueSchema: T) =>
  z.union([
    z.object({ type: z.literal("success"), result: valueSchema }),
    z.object({ type: z.literal("error"), error: z.string() }),
  ]);

/**
 * Represents the output of a tool execution
 * Either a success with a result of type T, or an error with a string message
 */
export type ToolOutput<T> = 
  | { type: "success"; result: T }
  | { type: "error"; error: string };

export function isOk<T>(
  output: ToolOutput<T>
): output is { type: "success"; result: T } {
  return output.type === "success";
}

export function ok<T>(result: T): ToolOutput<T> {
  return { type: "success", result };
}

export function err<T>(error: string): ToolOutput<T> {
  return { type: "error", error };
}
