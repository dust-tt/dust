// @vitest-environment node

import { dangerouslyGetDustManagedLlmCredentials } from "@app/lib/api/provider_credentials";
import { OpenAISimulatedFailureModelGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_simulated_failure_model_global_openai_responses";
import { OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStreamSetup } from "@app/lib/model_constructors/test/endpoints/openai_gpt_five_dot_four_mini_global_openai_responses.test";
import { runStreamEndpointTests } from "@app/lib/model_constructors/test/runner";
import type { StreamSetup } from "@app/lib/model_constructors/test/setup";

export const OpenAISimulatedFailureModelGlobalOpenAIResponsesStreamSetup: StreamSetup =
  {
    createInstance: () =>
      new OpenAISimulatedFailureModelGlobalOpenAIResponsesStream(
        dangerouslyGetDustManagedLlmCredentials()
      ),
    // The healthy synthetic model delegates to GPT-5.4 Mini and intentionally
    // shares its provider input contract.
    tests: OpenAIGptFiveDotFourMiniGlobalOpenAIResponsesStreamSetup.tests,
  };

runStreamEndpointTests(
  OpenAISimulatedFailureModelGlobalOpenAIResponsesStream,
  OpenAISimulatedFailureModelGlobalOpenAIResponsesStreamSetup
);
