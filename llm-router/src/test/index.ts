import { payload } from "@/test/conversations/textOnly";
import {
  REASONING_DETAILS_LEVELS,
  REASONING_EFFORTS,
  ReasoningDetailsLevel,
  ReasoningEffort,
  type InputConfig,
} from "@/types/config";
import type { FinishEvent } from "@/types/output";
import type { Payload } from "@/types/history";
import { expect } from "vitest";

export const TEMPERATURES = [0, 0.7, 1];
export const TOP_LOGPROBS = [0, 10, 100];
export const TOP_PROBABILITIES = [0, 0.5, 1];

export const getInputvalidationCases = ({
  temperatures = [undefined],
  reasoningEfforts = [undefined],
  reasoningDetailsLevels = [undefined],
  topLogprobs = [undefined],
  topProbability = [undefined],
}: {
  temperatures?: (number | undefined)[];
  reasoningEfforts?: (ReasoningEffort | undefined)[];
  reasoningDetailsLevels?: (ReasoningDetailsLevel | undefined)[];
  topLogprobs?: (number | undefined)[];
  topProbability?: (number | undefined)[];
} = {}) => {
  const cases: [{ payload: Payload; config: InputConfig }, FinishEvent][] = [];

  for (const temperature of temperatures) {
    for (const reasoningEffort of reasoningEfforts) {
      for (const reasoningDetailsLevel of reasoningDetailsLevels) {
        for (const topLogprob of topLogprobs) {
          for (const topProb of topProbability) {
            cases.push([
              {
                payload,
                config: {
                  temperature,
                  reasoningEffort,
                  reasoningDetailsLevel,
                  maxOutputTokens: 100,
                  topLogprobs: topLogprob,
                  topProbability: topProb,
                },
              },
              {
                type: "completion",
                content: {
                  value: expect.arrayContaining([
                    expect.objectContaining({ type: "text_generated" }),
                  ]),
                },
              },
            ]);
          }
        }
      }
    }
  }

  cases.push([
    {
      payload,
      config: {
        temperature: temperatures[0],
        reasoningEffort: REASONING_EFFORTS[0],
        reasoningDetailsLevel: REASONING_DETAILS_LEVELS[0],
        maxOutputTokens: undefined,
        topLogprobs: undefined,
        topProbability: undefined,
      },
    },
    {
      type: "completion",
      content: {
        value: expect.arrayContaining([
          expect.objectContaining({ type: "text_generated" }),
        ]),
      },
    },
  ]);

  return cases;
};
