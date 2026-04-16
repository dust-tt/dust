import type { ActionItemSchema } from "@app/lib/project_todo/analyze_conversation/types";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

export function buildActionItems(
  rawItems: z.infer<typeof ActionItemSchema>[],
  previousSIds: Set<string>,
  participantSIds: Set<string>
): TodoVersionedActionItem[] {
  const now = new Date().toISOString();
  return rawItems.map((item) => ({
    sId:
      item.sId !== undefined && previousSIds.has(item.sId)
        ? item.sId
        : uuidv4(),
    shortDescription: item.short_description,
    assigneeUserId:
      item.assignee_user_id && participantSIds.has(item.assignee_user_id)
        ? item.assignee_user_id
        : null,
    assigneeName: item.assignee_name ?? null,
    status: item.status,
    detectedDoneAt: item.status === "done" ? now : null,
    detectedDoneRationale: item.detected_done_rationale ?? null,
  }));
}

export function buildPromptActionItems(
  previousActionItems: TodoVersionedActionItem[]
): string {
  let prompt =
    "You are a document analyst. Your job is to extract action items from a document.\n\n" +
    "Action item guidelines:\n" +
    "- An action item is a concrete task that someone committed to doing, or was asked to do.\n" +
    "- If an action item was explicitly completed or resolved in the document, set status to 'done'.\n" +
    "- Include an assignee_name only when clearly stated in the document.\n" +
    "- Include an assignee_user_id (from the participant list) when the assignee matches a known participant.\n" +
    "- Be concise: one action item per distinct task.\n" +
    "- Do not include vague or aspirational items — only concrete commitments.\n\n";
  if (previousActionItems.length > 0) {
    prompt +=
      "The following action items were detected in a previous analysis of this document. " +
      "If you detect the same task again, copy its sId exactly into the output and keep the other required fields the same. " +
      "Omit the sId field for brand-new tasks that were not previously tracked.\n\n" +
      "Known action items:\n";
    for (const item of previousActionItems) {
      prompt += `<action_item sId="${item.sId}" status="${item.status}">`;
      prompt += `<short_description>${item.shortDescription}</short_description>`;
      if (item.assigneeName) {
        prompt += `<assignee name="${item.assigneeName}"`;
        if (item.assigneeUserId) {
          prompt += ` user_id="${item.assigneeUserId}"`;
        }
        prompt += ` />`;
      }
      prompt += `</action_item>`;
      prompt += "\n";
    }
    prompt += "\n";
  }
  return prompt;
}
