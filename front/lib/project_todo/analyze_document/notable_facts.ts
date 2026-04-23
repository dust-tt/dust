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
    "Most information in a document is NOT a notable fact. Prefer zero notable facts over " +
    "a noisy list. When in doubt, leave it out.\n\n" +
    "Only extract a fact if it passes ALL three tests:\n" +
    "1. **Actionability**: it would concretely change how a project member plans their work " +
    "or makes a decision. Good examples: deadlines discovered, technical constraints found, " +
    "dependency changes, risks identified, important metrics or thresholds.\n" +
    "2. **Durability**: a new project member joining two weeks from now would still benefit " +
    "from knowing it. Transient context does NOT qualify — skip: who is OoO today, errors " +
    "that occurred during an incident, how a UI element works. " +
    "If the fact only mattered during the conversation itself, it is not durable.\n" +
    "3. **Novelty**: it is not already captured as an action item, a key decision, or " +
    "obvious from the project description.\n\n" +
    "Examples of what are NOT notable facts:\n" +
    "- 'The + symbol shows there are more members than displayed' — UI clarification, not project knowledge.\n" +
    "- 'The traffic spike from a marketing campaign caused the outage' — transient incident context.\n" +
    "- 'The member display component needs calibration' — short-lived observation resolved in the thread.\n\n" +
    "Formatting rules:\n" +
    "- Be concise and specific — one fact per distinct piece of information. Do not combine " +
    "multiple facts into a single entry.\n" +
    "- Make descriptions self-sufficient: include enough specifics that a project member reading the list can grasp the fact without reading the original source — not 'Deadline moved' but 'Q3 launch deadline moved to October 15 due to infrastructure constraints found in the audit'.\n" +
    "- Mention users and agents by their name, NOT via their id or via a generic term " +
    "like User, Agent or Bot.\n" +
    "- Write each description as an objective factual statement. Name people by their actual " +
    "name when relevant. Do not use 'You' or 'Your' — these items are shown to all project " +
    "members, not just one person.\n" +
    "- Include relevant_user_ids (from the project members list) for people this fact is " +
    "relevant to or was stated by.\n\n";
  if (previousNotableFacts.length > 0) {
    prompt +=
      "The following notable facts were tracked in a previous analysis of this document. " +
      "You MUST always include ALL previously tracked facts in your output — never drop them. " +
      "For each previously tracked fact: copy its sId verbatim and update the description " +
      "only when the document provides new information about it. " +
      "Omit the sId field only for brand-new facts not previously tracked.\n\n" +
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
