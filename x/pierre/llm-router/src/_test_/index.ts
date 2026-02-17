import { expect } from "vitest";

import { query } from "@/_test_/fixtures/payload";
import {
  type InputConfig,
  REASONING_DETAILS_LEVELS,
  REASONING_EFFORTS,
} from "@/types/config";
import type { Payload } from "@/types/history";
import type { FinishEvent } from "@/types/output";

export const TEMPERATURES = [0, 0.7, 1];
export const TOP_LOGPROBS = [0, 10, 100];
export const TOP_PROBABILITIES = [0, 0.5, 1];

export const getInputvalidationCases = <C extends InputConfig>({
  temperatures = [undefined],
  reasoningEfforts = [undefined],
  reasoningDetailsLevels = [undefined],
  topLogprobs = [undefined],
  topProbability = [undefined],
  maxOutputTokens = [undefined],
}: {
  temperatures?: C["temperature"][];
  reasoningEfforts?: C["reasoningEffort"][];
  reasoningDetailsLevels?: C["reasoningDetailsLevel"][];
  topLogprobs?: C["topLogprobs"][];
  topProbability?: C["topProbability"][];
  maxOutputTokens?: C["maxOutputTokens"][];
} = {}): [{ payload: Payload; config: C }, FinishEvent][] => {
  const cases: [{ payload: Payload; config: C }, FinishEvent][] = [];

  for (const temperature of temperatures) {
    for (const reasoningEffort of reasoningEfforts) {
      for (const reasoningDetailsLevel of reasoningDetailsLevels) {
        for (const topLogprob of topLogprobs) {
          for (const topProb of topProbability) {
            for (const maxOutputToken of maxOutputTokens) {
              cases.push([
                {
                  payload: query,
                  config: {
                    temperature,
                    reasoningEffort,
                    reasoningDetailsLevel,
                    topLogprobs: topLogprob,
                    topProbability: topProb,
                    maxOutputTokens: maxOutputToken,
                  } as C,
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
  }

  cases.push([
    {
      payload: query,
      config: {
        temperature: temperatures[0],
        reasoningEffort: REASONING_EFFORTS[0],
        reasoningDetailsLevel: REASONING_DETAILS_LEVELS[0],
        maxOutputTokens: undefined,
        topLogprobs: undefined,
        topProbability: undefined,
      } as C,
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
