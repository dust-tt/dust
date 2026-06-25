import type { BaseEndpointConfiguration } from "@app/lib/model_constructors/configuration";
import {
  type GoogleAiStudioInputConfig,
  googleAiStudioConfigSchema,
} from "@app/lib/model_constructors/providers/google_ai_studio/inputConfig";
import { WithGoogleGenAIInputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/input";
import { WithGoogleGenAIOutputConverter } from "@app/lib/model_constructors/sdk/google_genai/converters/output";
import { rawOutputToEvents } from "@app/lib/model_constructors/sdk/google_genai/converters/output/utils";
import { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import type { ModelResponseEvent } from "@app/lib/model_constructors/types/output/events";
import { AGENT_PLATFORM_API } from "@app/lib/model_constructors/types/provider_apis";
import { GOOGLE_AI_STUDIO_PROVIDER_ID } from "@app/lib/model_constructors/types/provider_ids";
import type {
  GenerateContentParameters,
  GenerateContentResponse,
} from "@google/genai";
import { GoogleGenAI } from "@google/genai";

// Vertex AI `location` the endpoint targets. Only `global` today: Gemini 3.x
// preview models are published solely to the global endpoint (they 404 on
// `europe-west1`), and the native `generateContent` API does not serve the
// `eu` multi-region alias that the Anthropic partner API uses. Legacy reaches
// the same place — it passes no location, so `@google/genai` defaults to
// `global`. Extend with a specific region (e.g. `europe-west1`) once these
// models become available there.
export type AgentPlatformGoogleLocation = "global";

// Gemini-on-Vertex transport. Same @google/genai SDK and converters as the AI
// Studio client; only the client construction differs (Vertex project +
// location instead of an API key). Mirrors the legacy `useVertex` branch and is
// the path non-BYOK plans depend on.
export abstract class AgentPlatformGoogleStream extends WithGoogleGenAIInputConverter(
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
    regionalEndpoint: AgentPlatformGoogleLocation;
  };

  static readonly providerId = GOOGLE_AI_STUDIO_PROVIDER_ID;
  static readonly api = AGENT_PLATFORM_API;

  static readonly regionalEndpoint: AgentPlatformGoogleLocation;

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
