import type { PublicModelSelection } from "@dust-tt/client"

import type { Result } from "./types"
import { Ok, Err } from "./types"

/**
 * Reasoning efforts accepted by the Dust API's per-message model picker
 * (`ORDERED_REASONING_EFFORTS` in front/types/assistant/models/reasoning.ts).
 */
export const REASONING_EFFORTS = ["none", "light", "medium", "high"] as const

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]

/**
 * Per-message model override sent to the public API as `message.modelSelection`
 * — the API-side equivalent of the input-bar model picker. The mentioned agent
 * runs this model instead of its configured one.
 */
export type ModelSelection = PublicModelSelection

/**
 * An `--agents` entry: a base agent sId, optionally with a model-picker
 * override.
 */
export interface AgentSpec {
  /** The full spec string; used as the agent label in reports/checkpoints. */
  label: string
  agentId: string
  modelSelection: ModelSelection | undefined
}

function isReasoningEffort(value: string): value is ReasoningEffort {
  return (REASONING_EFFORTS as readonly string[]).includes(value)
}

/**
 * An `--agents` entry, in one of these forms:
 *
 *   dust                                                   (no override)
 *   dust#xai/grok-4.6                                      (model override)
 *   dust#xai/grok-4.6@high                                 (model + effort)
 *   dust#fireworks/accounts/fireworks/models/glm-5p3-flash@light
 *
 * The provider is everything up to the first `/` after `#`, so the model id
 * keeps its own slashes (Fireworks ids have three). The reasoning effort, if
 * any, follows a trailing `@`.
 */
const AGENT_SPEC_RE =
  /^(?<agentId>[^#]+)#(?<providerId>[^/]+)\/(?<modelId>[^@]+)(?:@(?<effort>[^@]+))?$/

export function parseAgentSpec(spec: string): Result<AgentSpec> {
  const label = spec.trim()
  if (label.length === 0) {
    return Err(new Error("Empty agent spec"))
  }
  if (!label.includes("#")) {
    return Ok({ label, agentId: label, modelSelection: undefined })
  }

  // Every group but `effort` is mandatory in the pattern, so a match has them.
  const groups = AGENT_SPEC_RE.exec(label)?.groups as
    | { agentId: string; providerId: string; modelId: string; effort?: string }
    | undefined
  if (!groups) {
    return Err(
      new Error(
        `Agent spec '${label}' must be '<sId>#<providerId>/<modelId>', ` +
          `optionally followed by '@<effort>'`
      )
    )
  }

  const { agentId, providerId, modelId, effort } = groups
  if (effort !== undefined && !isReasoningEffort(effort)) {
    return Err(
      new Error(
        `Agent spec '${label}' has an invalid reasoning effort '${effort}'. ` +
          `Expected one of: ${REASONING_EFFORTS.join(", ")}`
      )
    )
  }

  return Ok({
    label,
    agentId,
    modelSelection: {
      // The SDK types `providerId` as a closed union of the providers it knew
      // about at publish time, but the API takes any string and validates it
      // server-side — so a provider newer than the pinned client still works.
      providerId: providerId as ModelSelection["providerId"],
      modelId,
      ...(effort ? { reasoningEffort: effort } : {}),
    },
  })
}
