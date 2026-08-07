import type { GoogleAiStudioInputConfig } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { WithGoogleGenAIInputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/input";
import { WithGoogleGenAIOutputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/google_genai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { GOOGLE_AI_STUDIO_HOST } from "@app/lib/model_constructors/types/hosts";
import { GOOGLE_LAB } from "@app/lib/model_constructors/types/labs";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

export abstract class GoogleAiStudioStream extends WithGoogleGenAIInputConverter(
  WithGoogleGenAIOutputConverter(
    StreamEndpoint<
      GenerateContentParameters,
      GenerateContentResponse,
      GoogleAiStudioInputConfig
    >
  )
) {
  static readonly lab = GOOGLE_LAB;
  static readonly host = GOOGLE_AI_STUDIO_HOST;

  static readonly configSchema = googleAiStudioConfigSchema;

  private readonly client: GoogleGenAI;

  constructor({ GOOGLE_AI_STUDIO_API_KEY }: Credentials) {
    super();
    this.client = new GoogleGenAI({ apiKey: GOOGLE_AI_STUDIO_API_KEY });
  }

  async *streamRaw(
    input: GenerateContentParameters
  ): AsyncGenerator<GenerateContentResponse> {
    yield* await this.client.models.generateContentStream(input);
  }

  async *rawStreamOutputToEvents(
    stream: AsyncGenerator<GenerateContentResponse>
  ): AsyncGenerator<ModelResponseEvent> {
    yield* rawOutputToEvents(stream, this.metadata(), this);
  }
}
