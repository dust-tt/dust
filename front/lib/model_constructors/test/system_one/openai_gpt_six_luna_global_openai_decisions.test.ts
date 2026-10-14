// @vitest-environment node

import assert from "node:assert";
import { OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne } from "@app/lib/model_constructors/system_one/endpoints/openai_gpt_six_luna_global_openai_decisions";
import { describe, expect, it } from "vitest";

// Calls the live API. Run with:
// NODE_ENV=test RUN_LLM_TEST=true npx vitest --config lib/model_constructors/test/vite.config.js --run lib/model_constructors/test/system_one
describe.skipIf(process.env.RUN_LLM_TEST !== "true")(
  OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne.id,
  () => {
    const endpoint = new OpenAIGptSixLunaGlobalOpenAIDecisionsSystemOne({
      OPENAI_API_KEY: process.env.DUST_MANAGED_OPENAI_API_KEY ?? "",
    });

    it("answers predicate, choice and score questions", async () => {
      const result = await endpoint.decide({
        input: "What is 2 + 2?",
        questions: [
          {
            type: "predicate",
            name: "is_arithmetic",
            instructions: "Is the request a simple arithmetic question?",
          },
          {
            type: "choice",
            name: "language",
            instructions: "Which language is the request written in?",
            choices: [{ value: "english" }, { value: "french" }],
          },
          {
            type: "score",
            name: "difficulty",
            instructions: "How hard is the request to answer?",
            levels: [{ label: "trivial" }, { label: "hard" }],
          },
        ],
      });

      assert(
        result.isOk(),
        result.isErr() ? result.error.content.message : "expected an Ok result"
      );
      expect(result.value.answers.map(({ type }) => type)).toEqual([
        "predicate",
        "choice",
        "score",
      ]);
      expect(result.value.usage.standardInput).toBeGreaterThan(0);
      expect(result.value.usage.totalOutput).toBe(0);
    });

    it("returns an error instead of throwing when aborted", async () => {
      const result = await endpoint.decide(
        {
          input: "What is 2 + 2?",
          questions: [
            {
              type: "predicate",
              name: "is_arithmetic",
              instructions: "Is the request a simple arithmetic question?",
            },
          ],
        },
        { signal: AbortSignal.abort() }
      );

      assert(result.isErr(), "expected an Err result");
    });
  }
);
