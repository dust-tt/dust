import type { KeyDecision } from "@app/lib/project_todo/analyze_document/types";
import type { TodoVersionedKeyDecision } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";

export function buildKeyDecisions(
  rawDecisions: KeyDecision[],
  previousDecisions: KeyDecision[],
  validUserIds: Set<string>
): TodoVersionedKeyDecision[] {
  const previousDecisionsBySId = new Map(
    previousDecisions.map((decision) => [decision.sId, decision])
  );

  return rawDecisions.map((decision) => {
    const previousDecision = previousDecisionsBySId.get(decision.sId);
    return {
      sId: previousDecision?.sId ?? uuidv4(),
      shortDescription:
        decision.short_description ?? previousDecision?.short_description ?? "",
      relevantUserIds: (decision.relevant_user_ids ?? []).filter((id) =>
        validUserIds.has(id)
      ),
      status: decision.status ?? previousDecision?.status ?? "open",
    };
  });
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
    "- In the description, mention users and agents by their name, NOT via their id or " +
    "via a generic term like User, Agent or Bot.\n" +
    "- Write each description as an objective factual statement. Name people by their actual " +
    "name when relevant. Do not use 'You' or 'Your' — these items are shown to all project " +
    "members, not just one person.\n" +
    "- Include relevant_user_ids (from the project members list) for people involved in making this decision.\n\n";
  if (previousKeyDecisions.length > 0) {
    prompt +=
      "The following key decisions were detected in a previous analysis of this document. " +
      "If you detect the same decision again, copy its sId exactly into the output, update the other fields when appropriate. " +
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
