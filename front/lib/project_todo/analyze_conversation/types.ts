import { z } from "zod";

export const EXTRACT_CONVERSATION_TODOS_FUNCTION_NAME =
  "extract_conversation_todos";

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

export const NotableFactSchema = z.object({
  // Present when the fact matches a previously known notable fact. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z.string().optional(),
  text: z.string(),
  source_message_rank: z.number().int(),
});

export const KeyDecisionSchema = z.object({
  // Present when the decision matches a previously known key decision. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z.string().optional(),
  text: z.string(),
  source_message_rank: z.number().int(),
  status: z.enum(["decided", "open"]),
});

export const ExtractActionItemsResult = z.object({
  topic: z.string(),
  action_items: z.array(ActionItemSchema),
  notable_facts: z.array(NotableFactSchema),
  key_decisions: z.array(KeyDecisionSchema),
});

export type ExtractionResult = z.infer<typeof ExtractActionItemsResult>;
