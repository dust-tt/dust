import { WithGoogleAiStudioInputConverter } from "@app/lib/model_constructors/providers/google_ai_studio/converters/input";
import { WithGoogleAiStudioOutputConverter } from "@app/lib/model_constructors/providers/google_ai_studio/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/providers/google_ai_studio/converters/output/utils";
import { GEMINI_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/google_ai_studio/reasoning_efforts";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { inputConfigSchema } from "@app/lib/model_constructors/types/input/configuration";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { GOOGLE_AI_STUDIO_API } from "@app/lib/model_constructors/types/provider_apis";
import { GOOGLE_AI_STUDIO_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

import { z } from "zod";

const configSchema = inputConfigSchema.extend({
  reasoning: z
    .object({
      effort: z.enum([...GEMINI_SUPPORTED_NON_NULL_REASONING_EFFORTS, "none"]),
    })
    .optional(),
});

type GoogleAiStudioInputConfig = z.infer<typeof configSchema>;

export abstract class GoogleAiStudioStream extends WithGoogleAiStudioInputConverter(
  WithGoogleAiStudioOutputConverter(
    StreamEndpoint<GenerateContentParameters, GenerateContentResponse>
  )
) {
  static readonly providerId = GOOGLE_AI_STUDIO_PROVIDER_ID;
  static readonly api = GOOGLE_AI_STUDIO_API;

  static readonly configSchema: z.ZodType<GoogleAiStudioInputConfig> =
    configSchema;

  private readonly client: GoogleGenAI;

  constructor({ GOOGLE_AI_STUDIO_API_KEY }: Credentials) {
    super();
    this.client = new GoogleGenAI({ apiKey: GOOGLE_AI_STUDIO_API_KEY });
  }

  async *streamRaw(
    input: GenerateContentParameters
  ): AsyncGenerator<GenerateContentResponse> {
    const stream = await this.client.models.generateContentStream(input);
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<GenerateContentResponse>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
