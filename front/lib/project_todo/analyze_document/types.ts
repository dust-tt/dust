import { z } from "zod";

export const EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME =
  "extract_document_takeaways";

const ActionItemSchema = z.object({
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
    .optional()
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
    .optional()
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

export type ActionItem = z.infer<typeof ActionItemSchema>;

export const ExtractTakeawaysInputSchema = z.object({
  topic: z
    .string()
    .describe(
      "One-line summary of the document topic, e.g. 'Debugging the embed timeout issue'."
    ),
  action_items: z.array(ActionItemSchema),
});

export type ExtractionResult = z.infer<typeof ExtractTakeawaysInputSchema>;
