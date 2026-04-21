import type { ActionItem } from "@app/lib/project_todo/analyze_document/types";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";

export function buildActionItems(
  rawItems: ActionItem[],
  previousItems: ActionItem[],
  validUserIds: Set<string>
): TodoVersionedActionItem[] {
  const previousItemsBySId = new Map(
    previousItems.map((item) => [item.sId, item])
  );
  const now = new Date().toISOString();
  return rawItems.map((item) => {
    const previousItem = previousItemsBySId.get(item.sId);

    return {
      sId: previousItem?.sId ?? uuidv4(),
      shortDescription:
        item.short_description ?? previousItem?.short_description ?? "",
      assigneeUserId:
        item.assignee_user_id && validUserIds.has(item.assignee_user_id)
          ? item.assignee_user_id
          : null,
      assigneeName: item.assignee_name ?? null,
      status: item.status ?? previousItem?.status ?? "open",
      detectedDoneAt:
        item.status === "done" && previousItem?.status !== "done" ? now : null,
      detectedDoneRationale:
        item.detected_done_rationale ??
        previousItem?.detected_done_rationale ??
        null,
    };
  });
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
    "- Include an assignee_user_id (from the project members list) when the assignee matches a known project member.\n" +
    "- Be concise: one action item per distinct task.\n" +
    "- In the description, mention users and agents by their name, NOT via their id or via a generic term like User, Agent or Bot.\n" +
    "- In the description, refer to the assignee by Your pronouns (e.g., 'You', 'Your', 'Yours'), not by their name.\n" +
    "- Do not include vague or aspirational items — only concrete commitments.\n\n";
  if (previousActionItems.length > 0) {
    prompt +=
      "The following action items were detected in a previous analysis of this document. " +
      "If you detect the same task again, copy its sId exactly into the output, update the other fields when appropriate. " +
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
