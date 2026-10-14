import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type {
  DecisionQuestion,
  DecisionRequest,
} from "@app/lib/model_constructors/types/input/decisions";
import type { Model } from "@app/lib/model_constructors/types/models";
import type {
  DecisionAnswer,
  DecisionResult,
} from "@app/lib/model_constructors/types/output/decisions";
import type {
  ErrorEvent,
  TokenUsageContent,
} from "@app/lib/model_constructors/types/output/events";
import { buildErrorEvent } from "@app/lib/model_constructors/utils/build_error_event";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  Decision,
  DecisionCreateParams,
} from "openai/resources/decisions";

type ProviderAnswer = Decision["answers"][number];

export function toDecisionCreateParams(
  request: DecisionRequest,
  model: Model
): DecisionCreateParams {
  return { model, input: request.input, questions: request.questions };
}

/**
 * @cc [owner:pmilliotte,label:product] decision-usage-reports-billed-tokens
 * The returned usage MUST count only the tokens OpenAI bills for a decision, so that pricing it at
 * the model's standard rates yields the provider charge: uncached input as `standardInput` and
 * every other field 0. If OpenAI changes what it bills for decisions, this mapping changes, not the
 * model's rates.
 */
// Verified 2026-10-14: https://developers.openai.com/api/docs/guides/decisions
// Input is billed at the standard rate; output, cache reads and cache writes are not billed.
export function decisionUsageToTokenUsage(
  usage: Decision.Usage
): TokenUsageContent {
  const { cached_tokens, cache_write_tokens } = usage.input_tokens_details;

  return {
    standardInput: Math.max(
      0,
      usage.input_tokens - cached_tokens - cache_write_tokens
    ),
    cacheHit: 0,
    cacheCreated: 0,
    longCacheCreated: 0,
    shortCacheCreated: 0,
    totalOutput: 0,
  };
}

function toAnswer(
  question: DecisionQuestion,
  answer: ProviderAnswer
): DecisionAnswer | null {
  switch (answer.type) {
    case "predicate":
      return question.type === "predicate"
        ? {
            type: "predicate",
            name: question.name,
            probability: answer.probability,
          }
        : null;
    case "choice":
      return question.type === "choice" && typeof answer.choice === "string"
        ? {
            type: "choice",
            name: question.name,
            choice: answer.choice,
            confidence: answer.confidence,
            probabilities: answer.probabilities.map(
              ({ value, probability }) => ({
                value: String(value),
                probability,
              })
            ),
          }
        : null;
    case "score":
      return question.type === "score"
        ? {
            type: "score",
            name: question.name,
            score: answer.score,
            confidence: answer.confidence,
            probabilities: answer.probabilities,
          }
        : null;
    case "refusal":
      return null;
    default:
      assertNever(answer);
  }
}

export function decisionToResult(
  decision: Decision,
  request: DecisionRequest,
  metadata: EndpointMetadata
): Result<DecisionResult, ErrorEvent> {
  const answers: DecisionAnswer[] = [];

  for (const question of request.questions) {
    const providerAnswer = decision.answers.find(
      ({ name }) => name === question.name
    );
    if (providerAnswer?.type === "refusal") {
      return new Err(
        buildErrorEvent({
          errorSource: "provider",
          metadata,
          type: "refusal_error",
          message: `The provider refused to answer the decision question "${question.name}".`,
        })
      );
    }

    const answer = providerAnswer ? toAnswer(question, providerAnswer) : null;
    if (!answer) {
      return new Err(
        buildErrorEvent({
          errorSource: "provider",
          metadata,
          type: "model_output_error",
          message: `The decision has no valid "${question.type}" answer for question "${question.name}".`,
          originalError: decision,
        })
      );
    }

    answers.push(answer);
  }

  return new Ok({ answers, usage: decisionUsageToTokenUsage(decision.usage) });
}
