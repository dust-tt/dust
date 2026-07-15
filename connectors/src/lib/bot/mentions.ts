import type {
  AvailableModelType,
  LightAgentConfigurationType,
  PublicModelSelectionType,
  Result,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import jaroWinkler from "talisman/metrics/jaro-winkler";

export type MentionMatch = {
  agentId: string;
  agentName: string;
};

const EXACT_MATCH_MENTION_PREFIX = "=";

// Pattern to match @mention, +mention, ~mention, and =mention.
const MENTION_PATTERN = /(?<!\S)[@+~=]([a-zA-Z0-9_\.-]{1,40})(?=\s|,|$)/g;

// Matches a mention candidate against the models available on the workspace:
// either a bare model id (e.g. `gpt-5.6-luna`, run with the model's default
// reasoning effort) or a model id with a reasoning effort suffix (e.g.
// `gpt-5.6-luna-high`).
function findModelMatch(
  candidateName: string,
  availableModels: AvailableModelType[]
): PublicModelSelectionType | null {
  const candidate = candidateName.toLowerCase();

  // O(n²) acceptable: the models list is small (< 100 entries, 4 efforts max).
  for (const model of availableModels) {
    const modelId = model.modelId.toLowerCase();

    if (candidate === modelId) {
      return {
        providerId: model.providerId,
        modelId: model.modelId,
        reasoningEffort: model.defaultReasoningEffort,
      };
    }

    for (const effort of model.supportedReasoningEfforts) {
      if (candidate === `${modelId}-${effort}`) {
        return {
          providerId: model.providerId,
          modelId: model.modelId,
          reasoningEffort: effort,
        };
      }
    }
  }

  return null;
}

export function processMentions({
  message,
  activeAgentConfigurations,
  mentionCandidate,
  availableModels = [],
}: {
  message: string;
  activeAgentConfigurations: LightAgentConfigurationType[];
  mentionCandidate: string | null;
  availableModels?: AvailableModelType[];
}): Result<
  {
    mention: MentionMatch | undefined;
    modelSelection?: PublicModelSelectionType;
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

  const mentionCandidateName = mentionCandidate.slice(1).toLowerCase();

  // An agent whose name exactly matches the candidate always takes priority
  // over a model mention; only then do we look for an exact model match (e.g.
  // `+gpt-5.6-luna-high`), which invokes the default agent with that model.
  const hasExactAgentMatch = activeAgentConfigurations.some(
    (agentConfiguration) =>
      agentConfiguration.name.toLowerCase() === mentionCandidateName
  );

  if (!hasExactAgentMatch) {
    const modelSelection = findModelMatch(
      mentionCandidateName,
      availableModels
    );
    if (modelSelection) {
      return new Ok({
        mention: undefined,
        modelSelection,
        processedMessage: message.replace(mentionCandidate, "").trim(),
      });
    }
  }

  if (mentionCandidate.startsWith(EXACT_MATCH_MENTION_PREFIX)) {
    const exactCandidate = activeAgentConfigurations.find(
      (agentConfiguration) =>
        agentConfiguration.name.toLowerCase() === mentionCandidateName
    );

    if (!exactCandidate) {
      return new Err(
        new Error(
          `Agent ${mentionCandidate} is not available to you. Check the name or ask your workspace administrator for access.`
        )
      );
    }

    return new Ok({
      mention: {
        agentId: exactCandidate.sId,
        agentName: exactCandidate.name,
      },
      processedMessage: message.replace(mentionCandidate, "").trim(),
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
      jaroWinkler(mentionCandidateName, agentConfiguration.name.toLowerCase());

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
  const processedMessage = message.replace(mentionCandidate, "").trim();

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

  return new Ok({
    mention,
    processedMessage,
  });
}
