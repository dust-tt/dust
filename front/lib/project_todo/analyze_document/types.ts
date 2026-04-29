import { z } from "zod";

export const EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME =
  "extract_document_takeaways";

// New items require an assignee_user_id matching a known project member. Items
// whose assignee cannot be resolved to a project member are intentionally
// dropped — we'd rather miss an item than track one we can't route to a real
// user, since the assignee drives downstream notifications and ownership.
const NewActionItemSchema = z.object({
  short_description: z
    .string()
    .describe("Short description of the action item."),
  assignee_name: z
    .string()
    .describe("Name of the assignee, as it appears in the document."),
  assignee_user_id: z
    .string()
    .describe(
      "The participant id of the assigned person. Must be one of the participant ids listed in the prompt."
    ),
  detected_creation_rationale: z
    .string()
    .describe(
      "Brief explanation of why this item qualifies as a TODO — what commitment or request makes it worth tracking."
    ),
});

export type NewActionItem = z.infer<typeof NewActionItemSchema>;

const UpdatedActionItemSchema = z.object({
  sId: z
    .string()
    .describe(
      "Stable identifier of a previously tracked action item. Copy verbatim from the known action items list."
    ),
  short_description: z
    .string()
    .optional()
    .describe(
      "Updated description. Only set when the document materially changes the description; omit otherwise."
    ),
  assignee: z
    .object({
      user_id: z
        .string()
        .describe(
          "Participant id of the new assignee. Must be one of the participant ids listed in the prompt."
        ),
      name: z
        .string()
        .describe("Name of the new assignee, as it appears in the document."),
    })
    .optional()
    .describe(
      "Set together when the assignee changes. Both fields are required when present; omit otherwise."
    ),
  done: z
    .object({
      detected_done_rationale: z
        .string()
        .describe("Brief explanation of why the item is considered done."),
    })
    .optional()
    .describe(
      "Set only when the item was explicitly resolved in the document. Items can only transition to done; never back to open."
    ),
});

export type UpdatedActionItem = z.infer<typeof UpdatedActionItemSchema>;

export const ExtractTakeawaysInputSchema = z.object({
  new_action_items: z.array(NewActionItemSchema),
  updated_action_items: z.array(UpdatedActionItemSchema),
});

export type ExtractionResult = z.infer<typeof ExtractTakeawaysInputSchema>;
