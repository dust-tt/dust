import type { KeyDecisionSchema } from "@app/lib/project_todo/analyze_conversation/types";
import type { TodoVersionedKeyDecision } from "@app/types/conversation_todo_versioned";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

export function buildKeyDecisions(
  rawDecisions: z.infer<typeof KeyDecisionSchema>[],
  previousSIds: Set<string>
): TodoVersionedKeyDecision[] {
  return rawDecisions.map((decision) => ({
    sId:
      decision.sId !== undefined && previousSIds.has(decision.sId)
        ? decision.sId
        : uuidv4(),
    text: decision.text,
    relevantUserIds: [],
    sourceMessageRank: decision.source_message_rank,
    status: decision.status,
  }));
}

export function buildPromptKeyDecisions(
  previousKeyDecisions: TodoVersionedKeyDecision[]
): string {
  let prompt =
    "Key decision guidelines:\n" +
    "- A key decision is a choice or resolution that was explicitly made during the conversation " +
    "(e.g., a technical approach chosen, a scope change agreed upon, a trade-off accepted).\n" +
    "- Use the exact message rank where the decision was first reached as source_message_rank.\n" +
    "- Set status to 'decided' if the decision is finalized, 'open' if it is still being deliberated.\n" +
    "- Do not include minor preferences or passing comments — only significant, consequential decisions.\n\n";
  if (previousKeyDecisions.length > 0) {
    prompt +=
      "The following key decisions were detected in a previous analysis of this conversation. " +
      "If you detect the same decision again, copy its sId exactly into the output. " +
      "Omit the sId field for brand-new decisions that were not previously tracked.\n\n" +
      "Known key decisions:\n";
    for (const decision of previousKeyDecisions) {
      prompt += `- sId: ${decision.sId} | ${decision.status === "decided" ? "[decided]" : "[open]"} ${decision.text}\n`;
    }
    prompt += "\n";
  }
  return prompt;
}
