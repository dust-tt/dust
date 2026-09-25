import type { Model as HostModel } from "@anthropic-ai/sdk/resources/messages/messages";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import { defineDustStreamEndpoint } from "@app/lib/llms/stream/dust_stream_endpoint";
import {
  disableReasoningWhenForcingTool,
  dropTemperature,
} from "@app/lib/llms/stream/types/configuration";
import type { AnthropicInputConfig } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import { anthropicBaseConfigSchema } from "@app/lib/model_constructors/providers/anthropic/inputConfig";
import type { AnthropicSupportedNonNullReasoningEffort } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS } from "@app/lib/model_constructors/providers/anthropic/reasoning_efforts";
import { AnthropicStream } from "@app/lib/model_constructors/stream/clients/anthropic";
import type { Host } from "@app/lib/model_constructors/types/hosts";
import { ANTHROPIC_HOST } from "@app/lib/model_constructors/types/hosts";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import { ANTHROPIC_LAB } from "@app/lib/model_constructors/types/labs";
import type { Model } from "@app/lib/model_constructors/types/models";
import { isModel } from "@app/lib/model_constructors/types/models";
import type { Region } from "@app/lib/model_constructors/types/regions";
import { GLOBAL } from "@app/lib/model_constructors/types/regions";
import type {
  CustomModelEndpointType,
  CustomModelType,
} from "@app/types/assistant/models/custom_models";
import { CUSTOM_MODEL_FEATURE_FLAG } from "@app/types/assistant/models/custom_models";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { z } from "zod";

type WithCustomModelConfigParams = CustomModelType & {
  configSchema: z.ZodType<InputConfig, z.ZodTypeDef, unknown>;
  configParsers: Array<(config: InputConfig) => InputConfig>;
};

// Mixin, like the per-model configs, so the config-built `configSchema` can replace the
// base client's own without clashing with its static type.
function WithCustomModelConfig<
  TBase extends abstract new (
    ...args: any[]
  ) => object,
>(
  Base: TBase,
  {
    modelConfig,
    endpoint,
    configSchema,
    configParsers,
  }: WithCustomModelConfigParams
) {
  abstract class CustomModelConfig extends Base {
    static readonly configSchema = configSchema;
    static readonly configParsers = configParsers;

    static readonly contextSize = modelConfig.contextSize;
    static readonly maxOutputTokens = endpoint.maxOutputTokens;
    static readonly tokenPricing = endpoint.tokenPricing;

    static readonly displayName = modelConfig.displayName;
    static readonly description = modelConfig.description;
    static readonly modelConfig = modelConfig;
    static readonly endpointFilter = {
      featureFlags: { contains: CUSTOM_MODEL_FEATURE_FLAG },
    };
  }

  return CustomModelConfig;
}

// ---------------------------------------------------------------------------
// Anthropic API host.
// ---------------------------------------------------------------------------

const ANTHROPIC_EFFORTS = [
  "none",
  ...ANTHROPIC_SUPPORTED_NON_NULL_REASONING_EFFORTS,
] as const;
type AnthropicEffort = "none" | AnthropicSupportedNonNullReasoningEffort;

function isAnthropicEffort(effort: string): effort is AnthropicEffort {
  return (ANTHROPIC_EFFORTS as readonly string[]).includes(effort);
}

// Custom Anthropic models always run on global inference, never pinned to a region.
const ANTHROPIC_API_REGIONS: readonly Region[] = [GLOBAL];

type AnthropicCustomInput = {
  reasoningEfforts: AnthropicEffort[];
  defaultReasoningEffort: AnthropicEffort;
  supportsForcedTool: boolean;
};

function parseAnthropicEndpoint({
  lab,
  region,
  input,
}: CustomModelEndpointType): Result<AnthropicCustomInput, string> {
  if (lab !== ANTHROPIC_LAB) {
    return new Err(`lab ${lab} cannot be served by the Anthropic API`);
  }
  if (!ANTHROPIC_API_REGIONS.includes(region)) {
    return new Err(`region ${region} is not offered by the Anthropic API`);
  }

  const reasoningEfforts = input.reasoningEfforts.filter(isAnthropicEffort);
  const { defaultReasoningEffort, supportsForcedTool } = input;
  if (
    reasoningEfforts.length !== input.reasoningEfforts.length ||
    !isAnthropicEffort(defaultReasoningEffort)
  ) {
    return new Err(
      `reasoning efforts must be among ${ANTHROPIC_EFFORTS.join(", ")}`
    );
  }
  // A forced tool call disables reasoning: Anthropic rejects it with thinking on.
  if (supportsForcedTool && !reasoningEfforts.includes("none")) {
    return new Err(
      "supportsForcedTool requires reasoningEfforts to include none"
    );
  }

  return new Ok({
    reasoningEfforts,
    defaultReasoningEffort,
    supportsForcedTool,
  });
}

// Input contract of current Anthropic models: explicit temperature rejected, and reasoning
// always defaulted rather than left to the API. Older contracts are not supported.
function buildAnthropicConfigSchema({
  reasoningEfforts,
  defaultReasoningEffort,
  supportsForcedTool,
}: AnthropicCustomInput): z.ZodType<
  AnthropicInputConfig,
  z.ZodTypeDef,
  unknown
> {
  const schema = anthropicBaseConfigSchema.extend({
    reasoning: z
      .object({
        effort: z
          .enum(ANTHROPIC_EFFORTS)
          .refine((effort) => reasoningEfforts.includes(effort)),
      })
      .default({ effort: defaultReasoningEffort }),
    temperature: z.literal(1).optional().default(1),
  });

  return supportsForcedTool
    ? schema
    : schema.extend({ forceTool: z.undefined() });
}

function createCustomAnthropicStreamEndpoint(
  { modelConfig, endpoint }: CustomModelType,
  model: Model
): Result<DustStreamEndpointConstructor, string> {
  const parsed = parseAnthropicEndpoint(endpoint);
  if (parsed.isErr()) {
    return parsed;
  }
  const input = parsed.value;
  const { region } = endpoint;

  class CustomAnthropicStream extends WithCustomModelConfig(AnthropicStream, {
    modelConfig,
    endpoint,
    configSchema: buildAnthropicConfigSchema(input),
    configParsers: input.supportsForcedTool
      ? [disableReasoningWhenForcingTool, dropTemperature]
      : [dropTemperature],
  }) {
    static readonly model = model;
    static readonly region = region;
    static readonly id = this.buildId();

    modelToHostModel = (): HostModel => endpoint.hostModel;

    // Explicit: an omitted `inference_geo` falls back to the Anthropic workspace's
    // `default_inference_geo`, which may pin inference to a region.
    override async buildRequestPayload(
      payload: Payload,
      config: AnthropicInputConfig
    ) {
      return {
        ...(await super.buildRequestPayload(payload, config)),
        inference_geo: GLOBAL,
      };
    }
  }

  return new Ok(defineDustStreamEndpoint(CustomAnthropicStream));
}

// ---------------------------------------------------------------------------
// Dispatch on the host serving the endpoint.
// ---------------------------------------------------------------------------

function unsupportedHost(host: Host): Err<string> {
  return new Err(`host ${host} is not supported for custom models yet`);
}

// Also run by the generator, so an unsupported entry fails the build rather than startup.
export function validateCustomModelEndpoint(
  endpoint: CustomModelEndpointType
): Result<void, string> {
  switch (endpoint.host) {
    case ANTHROPIC_HOST: {
      const parsed = parseAnthropicEndpoint(endpoint);
      return parsed.isErr() ? parsed : new Ok(undefined);
    }
    default:
      return unsupportedHost(endpoint.host);
  }
}

export function createCustomStreamEndpoint(
  customModel: CustomModelType
): Result<DustStreamEndpointConstructor, string> {
  const { modelId } = customModel.modelConfig;
  if (!isModel(modelId)) {
    return new Err(`model ${modelId} is missing from MODELS`);
  }

  switch (customModel.endpoint.host) {
    case ANTHROPIC_HOST:
      return createCustomAnthropicStreamEndpoint(customModel, modelId);
    default:
      return unsupportedHost(customModel.endpoint.host);
  }
}

// Throws: the generator already rejects unsupported entries, so a failure here means the
// generated custom models file is inconsistent.
export function buildCustomStreamEndpoints(
  customModels: CustomModelType[]
): DustStreamEndpointConstructor[] {
  return customModels.map((customModel) => {
    const streamEndpoint = createCustomStreamEndpoint(customModel);
    if (streamEndpoint.isErr()) {
      throw new Error(
        `Custom model ${customModel.modelConfig.modelId}: ${streamEndpoint.error}.`
      );
    }
    return streamEndpoint.value;
  });
}
