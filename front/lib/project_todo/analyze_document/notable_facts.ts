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
    "- A notable fact is a significant piece of information shared in the document " +
    "that is worth remembering (e.g., a decision made, a key constraint, an important context).\n" +
    "- Be concise and specific — one fact per distinct piece of information.\n" +
    "- Do not include trivial or already widely known information.\n" +
    "- In the description, mention users and agents by their name, NOT via their id or via a generic term like User, Agent or Bot.\n" +
    "- In the description, refer to the assignee by Your pronouns (e.g., 'You', 'Your', 'Yours'), not by their name.\n" +
    "- Include relevant_user_ids (from the project members list) for people this fact is relevant to or was stated by.\n\n";
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
