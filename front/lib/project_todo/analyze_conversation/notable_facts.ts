import type { NotableFactSchema } from "@app/lib/project_todo/analyze_conversation/types";
import type { TodoVersionedNotableFact } from "@app/types/takeaways";
import { v4 as uuidv4 } from "uuid";
import type { z } from "zod";

export function buildNotableFacts(
  rawFacts: z.infer<typeof NotableFactSchema>[],
  previousSIds: Set<string>
): TodoVersionedNotableFact[] {
  return rawFacts.map((fact) => ({
    sId:
      fact.sId !== undefined && previousSIds.has(fact.sId)
        ? fact.sId
        : uuidv4(),
    text: fact.text,
    relevantUserIds: [],
    sourceMessageRank: fact.source_message_rank,
  }));
}

export function buildPromptNotableFacts(
  previousNotableFacts: TodoVersionedNotableFact[]
): string {
  let prompt =
    "Notable fact guidelines:\n" +
    "- A notable fact is a significant piece of information shared in the conversation " +
    "that is worth remembering (e.g., a decision made, a key constraint, an important context).\n" +
    "- Use the exact message rank where the fact was first mentioned as source_message_rank.\n" +
    "- Be concise and specific — one fact per distinct piece of information.\n" +
    "- Do not include trivial or already widely known information.\n\n";
  if (previousNotableFacts.length > 0) {
    prompt +=
      "The following notable facts were detected in a previous analysis of this conversation. " +
      "If you detect the same fact again, copy its sId exactly into the output. " +
      "Omit the sId field for brand-new facts that were not previously tracked.\n\n" +
      "Known notable facts:\n";
    for (const fact of previousNotableFacts) {
      prompt += `- sId: ${fact.sId} | ${fact.text}\n`;
    }
    prompt += "\n";
  }
  return prompt;
}
