import type {
  ResponseInputItem,
  ResponseToolSearchOutputItemParam,
  Tool,
} from "openai/resources/responses/responses";
import { z } from "zod";

const replayStatusSchema = z
  .enum(["in_progress", "completed", "incomplete"])
  .nullable()
  .optional();
const replayExecutionSchema = z.enum(["server", "client"]).optional();
// OpenAI does not expose a runtime schema for Tool. Validate the stable
// discriminator so Zod can return Tool[] without duplicating the SDK union.
const replayToolSchema = z.custom<Tool>(
  (value) =>
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof value.type === "string"
);

type OpenAIToolSearchItem =
  | ResponseInputItem.ToolSearchCall
  | ResponseToolSearchOutputItemParam;

// Validate only the stable fields Dust relies on. `.passthrough()` deliberately
// preserves the complete provider item so new OpenAI replay fields do not need
// plumbing through shared Dust types.
const toolSearchCallSchema: z.ZodType<ResponseInputItem.ToolSearchCall> = z
  .object({
    type: z.literal("tool_search_call"),
    arguments: z.record(z.unknown()),
    call_id: z.string().nullable().optional(),
    execution: replayExecutionSchema,
    status: replayStatusSchema,
  })
  .passthrough();

const toolSearchOutputSchema: z.ZodType<ResponseToolSearchOutputItemParam> = z
  .object({
    type: z.literal("tool_search_output"),
    tools: z.array(replayToolSchema),
    call_id: z.string().nullable().optional(),
    execution: replayExecutionSchema,
    status: replayStatusSchema,
  })
  .passthrough();

const openAIToolSearchItemSchema: z.ZodType<OpenAIToolSearchItem> = z.union([
  toolSearchCallSchema,
  toolSearchOutputSchema,
]);

// Returns null silently when the item is not a tool-search item:
// `parseOpenAIServerToolItem` tries every server-tool family and owns the
// "unparseable" warning.
export function parseOpenAIToolSearchItem(
  block: unknown
): ResponseInputItem | null {
  const result = openAIToolSearchItemSchema.safeParse(block);
  return result.success ? result.data : null;
}
