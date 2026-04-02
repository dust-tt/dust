import { z } from "zod";

export const EXTRACT_ACTION_ITEMS_FUNCTION_NAME = "extract_action_items";

export const ActionItemSchema = z.object({
  // Present when the item matches a previously known action item. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z.string().optional(),
  text: z.string(),
  assignee_name: z.string().optional(),
  source_message_rank: z.number().int(),
  status: z.enum(["open", "done"]),
  detected_done_rationale: z.string().optional(),
});

export const ExtractActionItemsResult = z.object({
  topic: z.string(),
  action_items: z.array(ActionItemSchema),
});

export type ExtractionResult = z.infer<typeof ExtractActionItemsResult>;
