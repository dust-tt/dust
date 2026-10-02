import type { Authenticator } from "@app/lib/auth";
import { serializeMention } from "@app/lib/mentions/format";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { RichAgentMention } from "@app/types/assistant/mentions";

const MAX_MENTION_LABEL_LENGTH = 1000;

// Pasted text is capped at 10K characters client-side; leave headroom for JSON
// escaping and multi-byte characters.
export const PARSE_MENTIONS_MAX_BODY_SIZE_BYTES = 256 * 1024;

/**
 * Parses pasted text containing @ mentions and converts them to the proper
 * mention format. Matches @agentName patterns against available agents in the
 * workspace and replaces them with the serialized mention representation.
 */
export async function parseMentionsInMarkdown({
  auth,
  markdown,
}: {
  auth: Authenticator;
  markdown: string;
}): Promise<string> {
  // Fetch agent configurations.
  const agents = await AgentResource.listReadable(auth);

  // Build agent mentions map.
  const agentMentions: RichAgentMention[] = agents.map((agent) =>
    agent.toMentionSuggestionJSON({ userFavorite: false })
  );

  // Disabling user mentions for now, as it may lead to customer pinging users unintentionally.
  //
  // const userMentions: RichUserMention[] = [];
  // const { members } = await getMembers(auth, { activeOnly: true });
  //
  // userMentions.push(...members.map(toRichUserMentionType));

  // Combine all mentions for matching.
  const allMentions = [...agentMentions /*, ...userMentions*/];

  // Sort mentions by label length (descending) to match longer names first.
  // This prevents "AI Assistant Pro" from being matched as "AI" when both exist.
  allMentions.sort((a, b) => b.label.length - a.label.length);

  let processedMarkdown = markdown;

  for (const mention of allMentions) {
    // Use a safe case-insensitive substring search instead of compiling a RegExp
    // per mention. This avoids expensive regex compilation on potentially
    // attacker-controlled large labels or markdown bodies while preserving the
    // previous matching semantics: an @mention must be at the start or preceded
    // by whitespace, and must be followed by whitespace, end-of-string, or
    // punctuation.

    // Skip empty labels and extremely long labels to avoid pathological work.
    if (!mention.label || mention.label.length > MAX_MENTION_LABEL_LENGTH) {
      continue;
    }

    const serialized = serializeMention(mention);

    // Work with a lowercase copy for case-insensitive searching, but copy
    // segments from the original string to preserve character casing outside
    // of the inserted serialized mention. Output is accumulated and joined once
    // so the cost stays linear in the markdown size regardless of match count.
    const lowerText = processedMarkdown.toLowerCase();
    const needle = `@${mention.label}`.toLowerCase();
    const parts: string[] = [];
    let copiedUpTo = 0;
    let searchIndex = 0;

    while (true) {
      const pos = lowerText.indexOf(needle, searchIndex);
      if (pos === -1) {
        break;
      }

      // Check character before the match (if any) is start or whitespace
      const beforeIdx = pos - 1;
      if (beforeIdx >= 0) {
        const beforeChar = lowerText.charAt(beforeIdx);
        if (!/\s/.test(beforeChar)) {
          searchIndex = pos + 1; // continue searching
          continue;
        }
      }

      // Check character after the match (if any) is whitespace, punctuation, or end
      const afterIdx = pos + needle.length;
      const afterChar = lowerText.charAt(afterIdx);
      if (afterChar && !/\s|[.,!?;:]/.test(afterChar)) {
        searchIndex = pos + 1;
        continue;
      }

      // Valid mention found — replace the @label with the serialized mention
      parts.push(processedMarkdown.slice(copiedUpTo, pos), serialized);
      copiedUpTo = afterIdx;
      searchIndex = afterIdx;
    }

    if (parts.length > 0) {
      parts.push(processedMarkdown.slice(copiedUpTo));
      processedMarkdown = parts.join("");
    }
  }

  return processedMarkdown;
}
