import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import type { GoogleAiStudioInputConfig } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { googleAiStudioConfigSchema } from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { WithGoogleGenAIInputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/input";
import { WithGoogleGenAIOutputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/google_genai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { AGENT_PLATFORM_HOST } from "@app/lib/model_constructors/types/hosts";
import { GOOGLE_LAB } from "@app/lib/model_constructors/types/labs";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

// Agent Platform `location` targeted by the endpoint. Gemini 3.8 Flash is
// available on both the global endpoint and the `eu` multi-region; older model
// registrations still use global where their regional rollout is not enabled.
export type GoogleAgentPlatformLocation = "global" | "eu";

// Gemini-on-Vertex transport. Same @google/genai SDK and converters as the AI
// Studio client; only the client construction differs (Vertex project +
// location instead of an API key). Mirrors the legacy `useVertex` branch and is
// the path non-BYOK plans depend on.
export abstract class GoogleAgentPlatformStream extends WithGoogleGenAIInputConverter(
  WithGoogleGenAIOutputConverter(
    StreamEndpoint<
      GenerateContentParameters,
      GenerateContentResponse,
      GoogleAiStudioInputConfig
    >
  )
) {
  // Narrow `this.constructor` so the per-endpoint static below is visible.
  declare ["constructor"]: BaseEndpointConfiguration<GoogleAiStudioInputConfig> & {
    regionalEndpoint: GoogleAgentPlatformLocation;
  };

  static readonly lab = GOOGLE_LAB;
  static readonly host = AGENT_PLATFORM_HOST;

  static readonly regionalEndpoint: GoogleAgentPlatformLocation;

  static readonly configSchema = googleAiStudioConfigSchema;

  private readonly client: GoogleGenAI;

  constructor({ AGENT_PLATFORM_PROJECT_ID }: Credentials) {
    super();
    this.client = new GoogleGenAI({
      vertexai: true,
      project: AGENT_PLATFORM_PROJECT_ID,
      location: this.constructor.regionalEndpoint,
    });
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
