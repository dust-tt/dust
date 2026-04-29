import type {
  NewActionItem,
  UpdatedActionItem,
} from "@app/lib/project_todo/analyze_document/types";
import type { Logger } from "@app/logger/logger";
import type { TodoVersionedActionItem } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";

// Builds the next version of action items by:
// - keeping every previously tracked item (only mutated when the LLM emits an
//   update for it),
// - applying optional updates from `updatedItems` keyed by sId — updates
//   targeting an unknown sId are dropped,
// - appending each `newItems` entry with a freshly generated sId — items whose
//   assignee_user_id is not a known project member are dropped.
export function buildActionItems(
  {
    newItems,
    updatedItems,
  }: {
    newItems: NewActionItem[];
    updatedItems: UpdatedActionItem[];
  },
  previousItems: TodoVersionedActionItem[],
  validUserIds: Set<string>,
  localLogger: Logger
): TodoVersionedActionItem[] {
  const now = new Date().toISOString();
  const updatesBySId = new Map(updatedItems.map((u) => [u.sId, u]));

  const merged: TodoVersionedActionItem[] = previousItems.map((prev) => {
    const update = updatesBySId.get(prev.sId);
    if (!update) {
      return prev;
    }

    // Apply assignee change only when the new user_id maps to a known project
    // member; otherwise keep the previous assignee untouched.
    const validAssigneeChange =
      update.assignee && validUserIds.has(update.assignee.user_id)
        ? update.assignee
        : null;

    const transitioningToDone = update.done && prev.status !== "done";

    return {
      sId: prev.sId,
      shortDescription: update.short_description ?? prev.shortDescription,
      assigneeUserId: validAssigneeChange
        ? validAssigneeChange.user_id
        : prev.assigneeUserId,
      assigneeName: validAssigneeChange
        ? validAssigneeChange.name
        : prev.assigneeName,
      status: update.done ? "done" : prev.status,
      detectedDoneAt: transitioningToDone ? now : prev.detectedDoneAt,
      detectedDoneRationale:
        update.done?.detected_done_rationale ?? prev.detectedDoneRationale,
    };
  });

  for (const item of newItems) {
    if (!validUserIds.has(item.assignee_user_id)) {
      localLogger.warn(
        {
          assigneeUserId: item.assignee_user_id,
          assigneeName: item.assignee_name,
          shortDescription: item.short_description,
        },
        "Document takeaway: dropping new action item with unknown assignee"
      );
      continue;
    }
    merged.push({
      sId: uuidv4(),
      shortDescription: item.short_description,
      assigneeUserId: item.assignee_user_id,
      assigneeName: item.assignee_name,
      status: "open",
      detectedDoneAt: null,
      detectedDoneRationale: null,
    });
  }

  return merged;
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
    "the same conversation, mark it done; if the request was immediately " +
    "fulfilled inline (e.g., answering a question), do not extract it at all.\n" +
    "4. **Distinctness**: it is not a duplicate of another action item or a rephrasing " +
    "5. **Relevance**: the task is work-related and project-relevant. Purely social plans " +
    "(birthday lunches, personal events, casual meetups) are not action items even if someone " +
    "commits to arranging them.\n\n" +
    "Output rules:\n" +
    "- Place brand-new action items in `new_action_items`. They MUST have a clear assignee " +
    "matching one of the project members; if you cannot identify a project member as assignee, " +
    "do not extract the item.\n" +
    "- Place changes to previously tracked items in `updated_action_items`, keyed by their sId. " +
    "Only include fields that materially changed in this document; omit unchanged fields. " +
    "Do not include items that have not changed at all.\n" +
    "- Mark an item as done by setting the `done` object with a brief rationale. Items can only " +
    "transition to done; never back to open.\n" +
    "- Be concise: one action item per distinct task.\n" +
    "- Make descriptions self-sufficient: include both the action AND its subject so the item is understandable without opening the source document. Prefer specific over vague — not 'Fix the bug' but 'Fix crash in batchRenderMessages when agent config is unavailable'; not 'Review PR' but 'Review PR #24679 — improves takeaway extraction prompts'.\n" +
    "- In the description, mention other users and agents by their name, NOT via their id or via a generic term like User, Agent or Bot.\n" +
    "- Never include the assignee's name in the description — the assignee is tracked separately via assignee_user_id. Refer to the assignee with 'you'/'your' pronouns when needed.\n\n";
  if (previousActionItems.length > 0) {
    prompt +=
      "Previously tracked action items (reference their sId in `updated_action_items` " +
      "to record changes):\n";
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
