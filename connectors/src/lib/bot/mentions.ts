import type { LightAgentConfigurationType, Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import jaroWinkler from "talisman/metrics/jaro-winkler";

export type MentionMatch = {
  agentId: string;
  agentName: string;
};

// Pattern to match @mention, +mention, and ~mention.
const MENTION_PATTERN = /(?<!\S)[@+~]([a-zA-Z0-9_-]{1,40})(?=\s|,|\.|$|)/g;

export function processMentions({
  message,
  activeAgentConfigurations,
  mentionCandidate,
}: {
  message: string;
  activeAgentConfigurations: LightAgentConfigurationType[];
  mentionCandidate: string | null;
}): Result<
  {
    mention: MentionMatch | undefined;
    processedMessage: string;
  },
  Error
> {
  if (!mentionCandidate) {
    return new Ok({
      mention: undefined,
      processedMessage: message,
    });
  }

  let bestCandidate: {
    agentId: string;
    agentName: string;
    distance: number;
  } | null = null;

  for (const agentConfiguration of activeAgentConfigurations) {
    const distance =
      1 -
      jaroWinkler(
        mentionCandidate.slice(1).toLowerCase(),
        agentConfiguration.name.toLowerCase()
      );

    if (bestCandidate === null || bestCandidate.distance > distance) {
      bestCandidate = {
        agentId: agentConfiguration.sId,
        agentName: agentConfiguration.name,
        distance: distance,
      };
    }
  }

  if (!bestCandidate) {
    return new Err(new Error(`Agent ${mentionCandidate} has not been found.`));
  }

  const mention = {
    agentId: bestCandidate.agentId,
    agentName: bestCandidate.agentName,
  };
  const processedMessage = message.replace(
    mentionCandidate,
    `:mention[${bestCandidate.agentName}]{sId=${bestCandidate.agentId}}`
  );

  return new Ok({
    mention,
    processedMessage,
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
  const fallbackAgentIds = ["dust", "claude-4-sonnet", "gpt-5"];

  let processedMessage = message;
  let mention: MentionMatch | undefined;

  const mentionCandidates = message.match(MENTION_PATTERN) ?? [];

  if (mentionCandidates.length > 1) {
    return new Err(new Error("Only one agent at a time can be called."));
  }

  // Extract all mentions from the message
  const mentionResult = processMentions({
    message,
    activeAgentConfigurations,
    mentionCandidate: mentionCandidates[0] ?? null,
  });

  if (mentionResult.isErr()) {
    return new Err(mentionResult.error);
  }

  mention = mentionResult.value.mention;
  if (mention) {
    processedMessage = mentionResult.value.processedMessage;
  }

  if (!mention) {
    // Use default agent if no mention found
    let defaultAgent: LightAgentConfigurationType | undefined = undefined;
    for (const agentId of fallbackAgentIds) {
      defaultAgent = activeAgentConfigurations.find(
        (ac) => ac.sId === agentId && ac.status === "active"
      );
      if (defaultAgent) {
        break;
      }
    }
    if (!defaultAgent) {
      return new Err(new Error("No agent has been configured to reply."));
    }
    mention = {
      agentId: defaultAgent.sId,
      agentName: defaultAgent.name,
    };
  }

  if (!processedMessage.includes(":mention")) {
    // if the message does not contain the mention, we add it as a prefix.
    processedMessage = `:mention[${mention.agentName}]{sId=${mention.agentId}} ${processedMessage}`;
  }

  return new Ok({
    mention,
    processedMessage,
  });
}
