import assert from "node:assert";
import { decisionToResult } from "@app/lib/model_constructors/sdk/openai_decisions/converters";
import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import type { DecisionRequest } from "@app/lib/model_constructors/types/input/decisions";
import type { Decision } from "openai/resources/decisions";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "openai",
  host: "openai-decisions",
  region: "global",
  model: "gpt-6-luna",
};

const request: DecisionRequest = {
  input: "Summarize this thread.",
  questions: [
    {
      type: "score",
      name: "tier",
      instructions: "Lowest tier that answers well.",
      levels: [{ label: "basic" }, { label: "standard" }],
    },
  ],
};

const usage: Decision.Usage = {
  input_tokens: 1_000,
  input_tokens_details: { cached_tokens: 300, cache_write_tokens: 100 },
  output_tokens: 12,
  output_tokens_details: { reasoning_tokens: 0 },
  total_tokens: 1_012,
};

function decisionWith(answers: Decision["answers"]): Decision {
  return { answers, model: "gpt-6-luna", usage };
}

const scoreAnswer: Decision.AnswerResourceScore = {
  type: "score",
  name: "tier",
  score: 0.2,
  confidence: 0.8,
  probabilities: [
    { label: "basic", value: 0, probability: 0.8 },
    { label: "standard", value: 1, probability: 0.2 },
  ],
};

describe("decisionToResult", () => {
  it("returns one answer per question with billed usage only", () => {
    const result = decisionToResult(
      decisionWith([scoreAnswer]),
      request,
      metadata
    );

    assert(result.isOk(), "expected an Ok result");
    expect(result.value.answers).toEqual([scoreAnswer]);
    expect(result.value.usage).toEqual({
      standardInput: 600,
      cacheHit: 0,
      cacheCreated: 0,
      longCacheCreated: 0,
      shortCacheCreated: 0,
      totalOutput: 0,
    });
  });

  it("returns a refusal error when the provider refuses a question", () => {
    const result = decisionToResult(
      decisionWith([{ type: "refusal", name: "tier" }]),
      request,
      metadata
    );

    assert(result.isErr(), "expected an Err result");
    expect(result.error.content.type).toBe("refusal_error");
  });

  it("returns a model output error when a question has no answer", () => {
    const result = decisionToResult(decisionWith([]), request, metadata);

    assert(result.isErr(), "expected an Err result");
    expect(result.error.content.type).toBe("model_output_error");
  });

  it("returns a model output error when the answer type does not match the question", () => {
    const result = decisionToResult(
      decisionWith([{ type: "predicate", name: "tier", probability: 0.9 }]),
      request,
      metadata
    );

    assert(result.isErr(), "expected an Err result");
    expect(result.error.content.type).toBe("model_output_error");
  });
});
