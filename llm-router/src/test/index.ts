import { TEMPERATURE_CONFIGS } from "@/test/configurations";
import { payload } from "@/test/conversations/textOnly";
import type { Config } from "@/types/config";
import type { FinishEvent } from "@/types/output";
import type { Payload } from "@/types/payload";
import { expect } from "vitest";

/**
 * Vitest matcher to match any string value
 */
export const anyString = () => expect.stringMatching(/.*/);

/**
 * Alternative: use expect.any(String) for type-based matching
 */
export const anyStringType = () => expect.any(String);

export const getCases = () => {
  const cases: [{ payload: Payload; config: Config }, FinishEvent][] = [];

  for (const temperatureConfig of TEMPERATURE_CONFIGS) {
    cases.push([
      { payload, config: { temperature: temperatureConfig } },
      {
        type: "completion",
        content: {
          textGenerated: { content: { value: "hi" }, type: "text_generated" },
          responseId: {
            content: { id: anyStringType() },
            type: "interaction_id",
          },
        },
      },
    ]);
  }

  return cases;
};
