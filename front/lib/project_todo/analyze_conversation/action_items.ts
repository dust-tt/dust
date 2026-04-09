import type { ActionItemSchema } from "@app/lib/project_todo/analyze_conversation/types";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

export function buildActionItems(
  rawItems: z.infer<typeof ActionItemSchema>[],
  previousSIds: Set<string>
): TodoVersionedActionItem[] {
  const now = new Date().toISOString();
  return rawItems.map((item) => ({
    sId:
      item.sId !== undefined && previousSIds.has(item.sId)
        ? item.sId
        : uuidv4(),
    text: item.text,
    assigneeUserId: null,
    assigneeName: item.assignee_name ?? null,
    sourceMessageRank: item.source_message_rank,
    status: item.status,
    detectedDoneAt: item.status === "done" ? now : null,
    detectedDoneRationale: item.detected_done_rationale ?? null,
  }));
}

export function buildPromptActionItems(
  previousActionItems: TodoVersionedActionItem[]
): string {
  let prompt =
    "You are a conversation analyst. Your job is to extract action items from a conversation.\n\n" +
    "Action item guidelines:\n" +
    "- An action item is a concrete task that someone committed to doing, or was asked to do.\n" +
    "- Use the exact message rank where the action item was first mentioned as source_message_rank.\n" +
    "- If an action item was explicitly completed or resolved in the conversation, set status to 'done'.\n" +
    "- Include an assignee_name only when clearly stated in the conversation.\n" +
    "- Be concise: one action item per distinct task.\n" +
    "- Do not include vague or aspirational items — only concrete commitments.\n\n";
  if (previousActionItems.length > 0) {
    prompt +=
      "The following action items were detected in a previous analysis of this conversation. " +
      "If you detect the same task again, copy its sId exactly into the output. " +
      "Omit the sId field for brand-new tasks that were not previously tracked.\n\n" +
      "Known action items:\n";
    for (const item of previousActionItems) {
      prompt += `- sId: ${item.sId} | ${item.status === "done" ? "[done]" : "[open]"} ${item.text}`;
      if (item.assigneeName) {
        prompt += ` (assigned: ${item.assigneeName})`;
      }
      prompt += "\n";
    }
    prompt += "\n";
  }
  return prompt;
}
