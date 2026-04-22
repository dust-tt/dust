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
    "Most conversations contain zero key decisions. Only extract one if it clearly passes " +
    "the tests below. Prefer zero over a noisy list.\n\n" +
    "Only extract a key decision if it passes ALL three tests:\n" +
    "1. **Impact**: would reversing this decision require a new team discussion? If not, it's " +
    "a preference or implementation detail, not a key decision. Examples that do NOT qualify: " +
    "choosing which algorithm to use for a bug fix, deciding how to structure one person's task, " +
    "picking a cron job approach for a nightly export, switching a query's pagination type.\n" +
    "2. **Explicitness**: the team must have explicitly decided — not just passively acknowledged. " +
    "Casual bystander reactions like 'Sounds good', 'Makes sense to me', or 'Good idea' do NOT " +
    "constitute an explicit decision. Look for deliberate agreement: 'we decided', 'we've agreed', " +
    "'we'll go with', or formal confirmation (e.g., confirmed in an all-hands or official meeting).\n" +
    "3. **Scope**: it affects how the whole project or team operates, not just how one person " +
    "handles their current task. Architecture choices, process changes, tooling adoptions, and " +
    "strategic commitments qualify. Individual implementation choices do not.\n\n" +
    "Set status to 'decided' if the decision is finalized, 'open' if it is still being " +
    "deliberated.\n\n" +
    "Formatting rules:\n" +
    "- In the description, mention users and agents by their name, NOT via their id or " +
    "via a generic term like User, Agent or Bot.\n" +
    "- Write each description as an objective factual statement. Name people by their actual " +
    "name when relevant. Do not use 'You' or 'Your' — these items are shown to all project " +
    "members, not just one person.\n" +
    "- Include relevant_user_ids (from the project members list) for people involved in making this decision.\n\n";
  if (previousKeyDecisions.length > 0) {
    prompt +=
      "The following key decisions were tracked in a previous analysis of this document. " +
      "You MUST always include ALL previously tracked decisions in your output — never drop them. " +
      "For each previously tracked decision: copy its sId verbatim and update status or description " +
      "only when the document provides new information about it. " +
      "Omit the sId field only for brand-new decisions not previously tracked.\n\n" +
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
