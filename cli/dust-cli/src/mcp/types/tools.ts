import type { z } from "zod";

export interface McpToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
}

export interface McpTool<TInputSchema extends z.ZodRawShape = z.ZodRawShape> {
  name: string;
  description: string;
  inputSchema: z.ZodObject<TInputSchema>;
  execute(args: z.infer<z.ZodObject<TInputSchema>>): Promise<McpToolResult>;
}
