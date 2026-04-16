import type { KeyDecisionSchema } from "@app/lib/project_todo/analyze_conversation/types";
import type { TodoVersionedKeyDecision } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

export function buildKeyDecisions(
  rawDecisions: z.infer<typeof KeyDecisionSchema>[],
  previousSIds: Set<string>,
  participantSIds: Set<string>
): TodoVersionedKeyDecision[] {
  return rawDecisions.map((decision) => ({
    sId:
      decision.sId !== undefined && previousSIds.has(decision.sId)
        ? decision.sId
        : uuidv4(),
    shortDescription: decision.short_description,
    relevantUserIds: (decision.relevant_user_ids ?? []).filter((id) =>
      participantSIds.has(id)
    ),
    status: decision.status,
  }));
}

export function buildPromptKeyDecisions(
  previousKeyDecisions: TodoVersionedKeyDecision[]
): string {
  let prompt =
    "Key decision guidelines:\n" +
    "- A key decision is a choice or resolution that was explicitly made in the document " +
    "(e.g., a technical approach chosen, a scope change agreed upon, a trade-off accepted).\n" +
    "- Set status to 'decided' if the decision is finalized, 'open' if it is still being deliberated.\n" +
    "- Do not include minor preferences or passing comments — only significant, consequential decisions.\n" +
    "- Include relevant_user_ids (from the participant list) for people involved in making this decision.\n\n";
  if (previousKeyDecisions.length > 0) {
    prompt +=
      "The following key decisions were detected in a previous analysis of this document. " +
      "If you detect the same decision again, copy its sId exactly into the output and keep the other required fields the same. " +
      "Omit the sId field for brand-new decisions that were not previously tracked.\n\n" +
      "Known key decisions:\n";
    for (const decision of previousKeyDecisions) {
      prompt += `<key_decision sId="${decision.sId}" status="${decision.status}">`;
      prompt += `<short_description>${decision.shortDescription}</short_description>`;
      if (decision.relevantUserIds && decision.relevantUserIds.length > 0) {
        prompt += `<relevant_user_ids>${decision.relevantUserIds.join(",")}</relevant_user_ids>`;
      }
      prompt += `</key_decision>\n`;
    }
    prompt += "\n";
  }
  return prompt;
}
