import { z } from "zod";

export const EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME =
  "extract_document_takeaways";

export const ActionItemSchema = z.object({
  // Present when the item matches a previously known action item. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z
    .string()
    .optional()
    .describe(
      "Stable identifier for this action item. Copy verbatim from the known action items list if this task was previously tracked. Omit for brand-new tasks."
    ),
  short_description: z
    .string()
    .describe("Short description of the action item."),
  assignee_name: z.string().optional(),
  assignee_user_id: z
    .string()
    .optional()
    .describe(
      "The participant id of the assigned person. Must be one of the participant ids listed in the prompt. Only set when an assignee is clearly identified."
    ),
  status: z
    .enum(["open", "done"])
    .describe(
      "'done' if the item was explicitly resolved in the document, 'open' otherwise."
    ),
  detected_done_rationale: z
    .string()
    .optional()
    .describe(
      "Brief explanation of why the item is considered done, if status is 'done'."
    ),
});

export const NotableFactSchema = z.object({
  // Present when the fact matches a previously known notable fact. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z
    .string()
    .optional()
    .describe(
      "Stable identifier for this notable fact. Copy verbatim from the known notable facts list if this fact was previously tracked. Omit for brand-new facts."
    ),
  short_description: z
    .string()
    .describe("Short description of the notable fact."),
  relevant_user_ids: z
    .array(z.string())
    .optional()
    .describe(
      "Participant ids of people this fact is relevant to or was stated by. Must be ids from the participant list in the prompt."
    ),
});

export const KeyDecisionSchema = z.object({
  // Present when the decision matches a previously known key decision. The LLM
  // should copy the sId verbatim from the list provided in the prompt.
  sId: z
    .string()
    .optional()
    .describe(
      "Stable identifier for this key decision. Copy verbatim from the known key decisions list if this decision was previously tracked. Omit for brand-new decisions."
    ),
  short_description: z
    .string()
    .describe("Short description of the key decision."),
  relevant_user_ids: z
    .array(z.string())
    .optional()
    .describe(
      "Participant ids of people involved in making this decision. Must be ids from the participant list in the prompt."
    ),
  status: z
    .enum(["decided", "open"])
    .describe(
      "'decided' if the decision is finalized, 'open' if still being deliberated."
    ),
});

export const ExtractTakeawaysInputSchema = z.object({
  topic: z
    .string()
    .describe(
      "One-line summary of the document topic, e.g. 'Debugging the embed timeout issue'."
    ),
  action_items: z.array(ActionItemSchema),
  notable_facts: z.array(NotableFactSchema),
  key_decisions: z.array(KeyDecisionSchema),
});

export type ExtractionResult = z.infer<typeof ExtractTakeawaysInputSchema>;
