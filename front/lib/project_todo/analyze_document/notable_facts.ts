import type { NotableFact } from "@app/lib/project_todo/analyze_document/types";
import type { TodoVersionedNotableFact } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";

export function buildNotableFacts(
  rawFacts: NotableFact[],
  previousFacts: NotableFact[],
  validUserIds: Set<string>
): TodoVersionedNotableFact[] {
  const previousFactsBySId = new Map(
    previousFacts.map((fact) => [fact.sId, fact])
  );
  return rawFacts.map((fact) => {
    const previousFact = previousFactsBySId.get(fact.sId);
    return {
      sId: previousFact?.sId ?? uuidv4(),
      shortDescription:
        fact.short_description ?? previousFact?.short_description ?? "",
      relevantUserIds: (fact.relevant_user_ids ?? []).filter((id) =>
        validUserIds.has(id)
      ),
    };
  });
}

export function buildPromptNotableFacts(
  previousNotableFacts: TodoVersionedNotableFact[]
): string {
  let prompt =
    "Notable fact guidelines:\n" +
    "- A notable fact is a piece of information that would change how a project member " +
    "plans their work or makes decisions. Good examples: deadlines discovered, technical " +
    "constraints found, dependency changes, risks identified, scope clarifications, " +
    "important metrics or thresholds.\n" +
    "- Be concise and specific — one fact per distinct piece of information.\n" +
    "- Do NOT extract: casual remarks, greetings, scheduling small-talk ('I'll be 5 min late'), " +
    "information obvious from the project description, facts already captured as action items " +
    "or key decisions, questions that were already answered in the conversation, or " +
    "time-sensitive facts that will be irrelevant within 24 hours (e.g., 'server is currently " +
    "down', 'waiting for a reply').\n" +
    "- In the description, mention users and agents by their name, NOT via their id or " +
    "via a generic term like User, Agent or Bot.\n" +
    "- Write each description as an objective factual statement. Name people by their actual " +
    "name when relevant. Do not use 'You' or 'Your' — these items are shown to all project " +
    "members, not just one person.\n" +
    "- Include relevant_user_ids (from the project members list) for people this fact is " +
    "relevant to or was stated by.\n\n";
  if (previousNotableFacts.length > 0) {
    prompt +=
      "The following notable facts were detected in a previous analysis of this document. " +
      "If you detect the same fact again, copy its sId exactly into the output, update the other fields when appropriate. " +
      "Omit the sId field for brand-new facts that were not previously tracked.\n\n" +
      "Known notable facts:\n";
    for (const fact of previousNotableFacts) {
      prompt += `<notable_fact sId="${fact.sId}">`;
      prompt += `<short_description>${fact.shortDescription}</short_description>`;
      if (fact.relevantUserIds && fact.relevantUserIds.length > 0) {
        prompt += `<relevant_user_ids>${fact.relevantUserIds.join(",")}</relevant_user_ids>`;
      }
      prompt += `</notable_fact>\n`;
    }
    prompt += "\n";
  }
  return prompt;
}
