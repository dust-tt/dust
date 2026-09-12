import OpenAI from "openai";
import type { Reasoning } from "openai/resources";
import type {
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import type { z } from "zod";

import { WithOpenAiResponsesConverter } from "@/clients/openai-responses/openaiResponsesConverter";
import { LargeLanguageModel } from "@/index";

const OPENAI_API_BASE_URL = "https://api.openai.com/v1";

export abstract class OpenAiResponses extends WithOpenAiResponsesConverter(
  LargeLanguageModel<ResponseCreateParamsStreaming, ResponseStreamEvent>
) {
  client: OpenAI;

  constructor({ apiKey, baseUrl }: { apiKey: string; baseUrl?: string }) {
    super();
    this.client = new OpenAI({
      apiKey: apiKey,
      baseURL: baseUrl ?? OPENAI_API_BASE_URL,
      defaultHeaders: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
      },
    });
  }

  abstract toReasoning(
    reasoning: z.infer<typeof this.configSchema>["reasoning"]
  ): Reasoning | null;
}
