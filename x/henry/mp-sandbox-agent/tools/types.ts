import { z } from "zod";

export type Tool = {
  fn: (
    input: any,
    extra: {
      log: (message: string) => void;
    }
  ) => Promise<ToolOutput<any>>;
  input: z.ZodType<any>;
  output: z.ZodType<any>; // This represents the success case schema
  description: string;
};

export const ToolOutput = <T extends z.ZodType>(valueSchema: T) =>
  z.union([
    z.object({ type: z.literal("success"), result: valueSchema }),
    z.object({ type: z.literal("error"), error: z.string() }),
  ]);

export type ToolOutput<T> = z.infer<
  ReturnType<typeof ToolOutput<z.ZodType<T>>>
>;

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
