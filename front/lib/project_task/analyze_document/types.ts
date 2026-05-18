import { z } from "zod";

export const EXTRACT_DOCUMENT_TAKEAWAYS_FUNCTION_NAME =
  "extract_document_takeaways";

export const MIN_SHORT_DESCRIPTION_LENGTH = 16;
export const MAX_SHORT_DESCRIPTION_LENGTH = 256;

// Assignee fields are optional: if the document does not name a clear project
// member as owner, the item is still created without an assignee rather than
// being dropped. When assignee_user_id is provided it must match a known
// project member id — unresolvable ids are cleared and the item is kept
// unassigned.
const NewActionItemSchema = z.object({
  short_description: z
    .string()
    .min(MIN_SHORT_DESCRIPTION_LENGTH)
    .max(MAX_SHORT_DESCRIPTION_LENGTH)
    .describe("Short description of the action item."),
  assignee_name: z
    .string()
    .optional()
    .describe("Name of the assignee, as it appears in the document."),
  assignee_user_id: z
    .string()
    .optional()
    .describe(
      "The participant id of the assigned person. Must be one of the participant ids listed in the prompt. Omit if no project member can be identified as assignee."
    ),
  detected_creation_rationale: z
    .string()
    .describe(
      "Brief explanation of why this item qualifies as a task — what commitment or request makes it worth tracking."
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
    .min(MIN_SHORT_DESCRIPTION_LENGTH)
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
});

export type UpdatedActionItem = z.infer<typeof UpdatedActionItemSchema>;

export const ExtractTakeawaysInputSchema = z.object({
  new_action_items: z.array(NewActionItemSchema),
  updated_action_items: z.array(UpdatedActionItemSchema),
});

export type ExtractionResult = z.infer<typeof ExtractTakeawaysInputSchema>;

/**
 * One-time lookback for the first automatic task analysis run after enabling generation.
 * Stored on project_metadata for the workflow only; not exposed in public API types.
 */
export const INITIAL_TASKS_SYNC_LOOKBACK_VALUES = [
  "now",
  "last_24h",
  "max",
] as const;

export type InitialTasksSyncLookbackValue =
  (typeof INITIAL_TASKS_SYNC_LOOKBACK_VALUES)[number];

export function isInitialTaskSyncLookback(
  value: string | null | undefined
): value is InitialTasksSyncLookbackValue {
  return (
    value != null &&
    (INITIAL_TASKS_SYNC_LOOKBACK_VALUES as readonly string[]).includes(value)
  );
}
