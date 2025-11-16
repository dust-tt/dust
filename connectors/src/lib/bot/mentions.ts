import type { LightAgentConfigurationType, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import jaroWinkler from "talisman/metrics/jaro-winkler";

type MentionMatch = {
  assistantId: string;
  assistantName: string;
};

// Pattern to match @mention, +mention, and ~mention
const MENTION_PATTERN = /(?<!\S)[@+~]([a-zA-Z0-9_-]{1,40})(?=\s|,|\.|$|)/g;

export function processMentions({
  message,
  activeAgentConfigurations,
  mentionPattern,
}: {
  message: string;
  activeAgentConfigurations: LightAgentConfigurationType[];
  mentionPattern: RegExp;
}): Result<
  {
    mention: MentionMatch | undefined;
    processedMessage: string;
    allMentionCandidates: string[];
  },
  Error
> {
  const mentionCandidates = message.match(mentionPattern) || [];

  const [mentionCandidate] = mentionCandidates;
  if (mentionCandidate) {
    let bestCandidate:
      | {
          assistantId: string;
          assistantName: string;
          distance: number;
        }
      | undefined = undefined;

    for (const agentConfiguration of activeAgentConfigurations) {
      const distance =
        1 -
        jaroWinkler(
          mentionCandidate.slice(1).toLowerCase(),
          agentConfiguration.name.toLowerCase()
        );

      if (bestCandidate === undefined || bestCandidate.distance > distance) {
        bestCandidate = {
          assistantId: agentConfiguration.sId,
          assistantName: agentConfiguration.name,
          distance: distance,
        };
      }
    }

    if (bestCandidate) {
      const mention = {
        assistantId: bestCandidate.assistantId,
        assistantName: bestCandidate.assistantName,
      };
      const processedMessage = message.replace(
        mentionCandidate,
        `:mention[${bestCandidate.assistantName}]{sId=${bestCandidate.assistantId}}`
      );

      return new Ok({
        mention,
        processedMessage,
        allMentionCandidates: mentionCandidates,
      });
    } else {
      return new Err(
        new Error(`Assistant ${mentionCandidate} has not been found.`)
      );
    }
  }

  return new Ok({
    mention: undefined,
    processedMessage: message,
    allMentionCandidates: mentionCandidates,
  });
}

export function findBestAgentMatch(
  query: string,
  activeAgentConfigurations: LightAgentConfigurationType[]
): LightAgentConfigurationType | undefined {
  if (activeAgentConfigurations.length === 0) {
    return undefined;
  }

  let bestMatch:
    | {
        agent: LightAgentConfigurationType;
        distance: number;
      }
    | undefined = undefined;

  const queryLower = query.toLowerCase();

  for (const agent of activeAgentConfigurations) {
    const distance = 1 - jaroWinkler(queryLower, agent.name.toLowerCase());

    if (bestMatch === undefined || bestMatch.distance > distance) {
      bestMatch = {
        agent,
        distance,
      };
    }
  }

  return bestMatch?.agent;
}

export function processMessageForMention({
  message,
  activeAgentConfigurations,
}: {
  message: string;
  activeAgentConfigurations: LightAgentConfigurationType[];
}): Result<
  {
    mention: MentionMatch;
    processedMessage: string;
  },
  Error
> {
  // Default mention pattern supports @, ~, and + prefixes (covers all platforms)
  const defaultAgentIds = ["dust", "claude-4-sonnet", "gpt-5"];

  let processedMessage = message;
  let mention: MentionMatch | undefined;

  // Extract all mentions from the message
  const mentionResult = processMentions({
    message,
    activeAgentConfigurations,
    mentionPattern: MENTION_PATTERN,
  });

  if (mentionResult.isErr()) {
    return new Err(mentionResult.error);
  }

  if (mentionResult.value.allMentionCandidates.length > 1) {
    return new Err(new Error("Only one agent at a time can be called."));
  }

  mention = mentionResult.value.mention;
  if (mention) {
    processedMessage = mentionResult.value.processedMessage;
  }

  if (!mention) {
    // Use default agent if no mention found
    let defaultAssistant: LightAgentConfigurationType | undefined = undefined;
    for (const agentId of defaultAgentIds) {
      defaultAssistant = activeAgentConfigurations.find(
        (ac) => ac.sId === agentId && ac.status === "active"
      );
      if (defaultAssistant) {
        break;
      }
    }
    if (!defaultAssistant) {
      return new Err(new Error("No agent has been configured to reply."));
    }
    mention = {
      assistantId: defaultAssistant.sId,
      assistantName: defaultAssistant.name,
    };
  }

  if (!processedMessage.includes(":mention")) {
    // if the message does not contain the mention, we add it as a prefix.
    processedMessage = `:mention[${mention.assistantName}]{sId=${mention.assistantId}} ${processedMessage}`;
  }

  return new Ok({
    mention,
    processedMessage,
  });
}
