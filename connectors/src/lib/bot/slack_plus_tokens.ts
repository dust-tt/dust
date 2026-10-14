import type { PublicModelSelection, Result } from "@dust-tt/client";
import {
  canonicalizeKnownModelLLMId,
  Err,
  getProviderIdForKnownModelId,
  Ok,
} from "@dust-tt/client";

// Leading +/~/= tokens after the Slack bot mention. Bodies may include `/` for
// Fireworks model ids and an optional trailing `/reasoningEffort`.
const SLACK_PLUS_TOKEN_PATTERN = /^\s*([+~=][^\s,]{1,80})/;

const REASONING_EFFORTS = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "maximal",
  "light",
] as const;

type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export type SlackPlusTokenParseErrorCode =
  | "multiple_agents"
  | "multiple_models"
  | "unknown_model";

export class SlackPlusTokenParseError extends Error {
  constructor(
    readonly code: SlackPlusTokenParseErrorCode,
    readonly token?: string
  ) {
    super(code);
  }
}

export type ParsedSlackPlusTokens = {
  agentMentionCandidate: string | null;
  modelSelection: PublicModelSelection | undefined;
  matchedTokens: string[];
};

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value);
}

function tryParseModelSelection(
  body: string
): PublicModelSelection | "unknown_model" | null {
  const canonical = canonicalizeKnownModelLLMId(body);
  if (canonical) {
    const providerId = getProviderIdForKnownModelId(canonical);
    if (!providerId) {
      return "unknown_model";
    }
    return { providerId, modelId: canonical };
  }

  const lower = body.toLowerCase();
  for (const effort of REASONING_EFFORTS) {
    const suffix = `/${effort}`;
    if (lower.endsWith(suffix) && lower.length > suffix.length) {
      const modelPart = body.slice(0, -suffix.length);
      const modelId = canonicalizeKnownModelLLMId(modelPart);
      if (!modelId) {
        return "unknown_model";
      }
      const providerId = getProviderIdForKnownModelId(modelId);
      if (!providerId) {
        return "unknown_model";
      }
      return {
        providerId,
        modelId,
        reasoningEffort: effort,
      };
    }
  }

  // Slash present but not a known model[/effort] form.
  if (body.includes("/")) {
    const lastSlash = lower.lastIndexOf("/");
    const maybeEffort = lower.slice(lastSlash + 1);
    if (maybeEffort.length > 0 && !isReasoningEffort(maybeEffort)) {
      return "unknown_model";
    }
  }

  return null;
}

function classifyToken(
  token: string
):
  | { kind: "agent"; candidate: string }
  | { kind: "model"; selection: PublicModelSelection }
  | { kind: "unknown_model" } {
  const prefix = token[0];
  const body = token.slice(1);

  if (prefix === "+") {
    const parsed = tryParseModelSelection(body);
    if (parsed === "unknown_model") {
      return { kind: "unknown_model" };
    }
    if (parsed) {
      return { kind: "model", selection: parsed };
    }
  }

  // Agent names do not include `/`; a slash here means a bad model token.
  if (body.includes("/")) {
    return { kind: "unknown_model" };
  }

  return { kind: "agent", candidate: token };
}

/**
 * Parse consecutive leading `+` / `~` / `=` tokens used to pick an agent and/or
 * a model (+ optional reasoning effort), e.g.:
 * - `+claude-opus-5-5`
 * - `+claude-opus-5-5/high`
 * - `+myagent +claude-opus-5-5/high`
 */
export function parseSlackLeadingPlusTokens(
  text: string
): Result<ParsedSlackPlusTokens, SlackPlusTokenParseError> {
  let remaining = text;
  let agentMentionCandidate: string | null = null;
  let modelSelection: PublicModelSelection | undefined;
  const matchedTokens: string[] = [];

  while (true) {
    const match = remaining.match(SLACK_PLUS_TOKEN_PATTERN);
    if (!match?.[1]) {
      break;
    }

    const token = match[1];
    const classified = classifyToken(token);

    if (classified.kind === "unknown_model") {
      return new Err(new SlackPlusTokenParseError("unknown_model", token));
    }

    if (classified.kind === "model") {
      if (modelSelection) {
        return new Err(new SlackPlusTokenParseError("multiple_models", token));
      }
      modelSelection = classified.selection;
    } else {
      if (agentMentionCandidate) {
        return new Err(new SlackPlusTokenParseError("multiple_agents", token));
      }
      agentMentionCandidate = classified.candidate;
    }

    matchedTokens.push(token);
    remaining = remaining.slice(match[0].length);
  }

  return new Ok({
    agentMentionCandidate,
    modelSelection,
    matchedTokens,
  });
}

export function stripSlackPlusTokensFromMessage(
  message: string,
  matchedTokens: string[]
): string {
  let processed = message;
  for (const token of matchedTokens) {
    processed = processed.replace(token, "");
  }
  return processed.trim();
}
