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
    "Action item guidelines:\n" +
    "Most documents contain few or no action items. Prefer fewer, high-confidence items " +
    "over a noisy list. When in doubt, leave it out.\n\n" +
    "Only extract an action item if it passes ALL criterias:\n" +
    "1. **Humans**: ignore any action items that was assigned or completed by an agent, assistant or bot." +
    "2. **Commitment**: someone explicitly committed to doing a concrete task, or was " +
    "clearly asked to do one. Only extract tasks with a clear deliverable — 'I'll fix X' " +
    "qualifies, 'I'll think about it' does not.\n" +
    "3. **Durability**: the task is still relevant — if it was already resolved within " +
    "the same conversation, set status to 'done'; if the request was immediately " +
    "fulfilled inline (e.g., answering a question), do not extract it at all.\n" +
    "4. **Distinctness**: it is not a duplicate of another action item or a rephrasing " +
    "5. **Relevance**: the task is work-related and project-relevant. Purely social plans " +
    "(birthday lunches, personal events, casual meetups) are not action items even if someone " +
    "commits to arranging them.\n\n" +
    "Formatting rules:\n" +
    "- If an action item was explicitly completed or resolved in the document, set status to 'done'.\n" +
    "- Include an assignee_name only when clearly stated in the document.\n" +
    "- Include an assignee_user_id (from the project members list) when the assignee matches a known project member.\n" +
    "- Be concise: one action item per distinct task.\n" +
    "- Make descriptions self-sufficient: include both the action AND its subject so the item is understandable without opening the source document. Prefer specific over vague — not 'Fix the bug' but 'Fix crash in batchRenderMessages when agent config is unavailable'; not 'Review PR' but 'Review PR #24679 — improves takeaway extraction prompts'.\n" +
    "- In the description, mention users and agents by their name, NOT via their id or via a generic term like User, Agent or Bot.\n" +
    "- In the description, refer to the assignee by Your pronouns (e.g., 'You', 'Your', 'Yours'), not by their name.\n\n";
  if (previousActionItems.length > 0) {
    prompt +=
      "The following action items were tracked in a previous analysis of this document. " +
      "You MUST always include ALL previously tracked items in your output — never drop them. " +
      "For each previously tracked item: copy its sId verbatim and update status or description " +
      "only when the document explicitly provides new information (e.g., the assignee reports it is done). " +
      "Omit the sId field only for brand-new tasks that were not previously tracked.\n\n" +
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
