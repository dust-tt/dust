import { PROBES_PER_RECOVERY } from "@app/lib/api/llm/health/config";
import { dangerouslyGetDustManagedLlmCredentials } from "@app/lib/api/provider_credentials";
import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Short enough that the provider has nothing to think about, and phrased so the
// first token arrives immediately.
const PROBE_PROMPT = "Reply with the single character: 1";

export function findStreamEndpoint({
  modelId,
  providerId,
  host,
}: DegradedModelEndpointType): DustStreamEndpointConstructor | null {
  for (const endpoint of Object.values(DUST_STREAM_ENDPOINTS)) {
    if (
      endpoint.modelConfig.modelId === modelId &&
      endpoint.modelConfig.providerId === providerId &&
      endpoint.host === host
    ) {
      return endpoint;
    }
  }

  return null;
}

/**
 * The cheapest config an endpoint will accept.
 *
 * Reasoning off is the goal, but each endpoint's schema mirrors what its
 * provider actually supports, and they disagree: some expose `none`, some reject
 * it and rely on a `configParsers` entry to map it onto their own floor. The
 * parsers therefore run before `parse`, exactly as `buildConfig` does in
 * transitionLLM. Where even that is refused, fall back to the empty config so
 * the schema applies its own defaults -- a probe that thinks for a moment is
 * still a probe, and we abort at the first token either way.
 */
function buildProbeConfig(
  endpoint: DustStreamEndpointConstructor
): InputConfig {
  const parsers = endpoint.configParsers ?? [];
  const withReasoningOff = parsers.reduce<InputConfig>(
    (acc, parser) => parser(acc),
    { reasoning: { effort: "none" } }
  );

  const parsed = endpoint.configSchema.safeParse(withReasoningOff);
  if (parsed.success) {
    return parsed.data;
  }

  return endpoint.configSchema.parse(
    parsers.reduce<InputConfig>((acc, parser) => parser(acc), {})
  );
}

/**
 * One synthetic inference against a live endpoint.
 *
 * Deliberately bypasses `LLM`: no `Run` row, no usage row, no Langfuse trace and
 * no counter write, so a probe can never feed the very signal it is measuring.
 *
 * Resolves as soon as the endpoint emits its first token. That is all we need --
 * one inferred token proves it is serving -- and returning early from the
 * generator stops the generation instead of paying for a full response.
 */
async function runSingleProbe(
  endpoint: DustStreamEndpointConstructor
): Promise<boolean> {
  const credentials = dangerouslyGetDustManagedLlmCredentials();
  const instance = new endpoint(credentials);

  const config = buildProbeConfig(endpoint);

  const payload: Payload = {
    conversation: {
      system: [],
      messages: [
        { role: "user", type: "text", content: { value: PROBE_PROMPT } },
      ],
    },
  };

  const input = await instance.buildRequestPayload(payload, config);
  const events = instance.rawStreamOutputToEvents(instance.streamRaw(input));

  try {
    for await (const event of events) {
      switch (event.type) {
        case "text_delta":
        case "reasoning_delta":
        case "text":
        case "reasoning":
        case "success":
          return true;
        case "error":
          return false;
        default:
          continue;
      }
    }
  } finally {
    // Stops the provider stream when we returned before it ended.
    await events.return(undefined);
  }

  // The stream closed without a terminal event: not a healthy endpoint.
  return false;
}

/**
 * A recovery round: `PROBES_PER_RECOVERY` sequential probes, all of which must
 * succeed. Sequential rather than parallel so a provider that is only
 * intermittently serving cannot pass on a lucky burst.
 */
export async function probeEndpoint(
  endpoint: DegradedModelEndpointType
): Promise<boolean> {
  const constructor = findStreamEndpoint(endpoint);
  if (!constructor) {
    logger.error(
      {
        modelId: endpoint.modelId,
        providerId: endpoint.providerId,
        host: endpoint.host,
      },
      "No stream endpoint matches the endpoint to probe"
    );
    return false;
  }

  for (let attempt = 0; attempt < PROBES_PER_RECOVERY; attempt++) {
    let healthy: boolean;
    try {
      healthy = await runSingleProbe(constructor);
    } catch (err) {
      // The provider SDKs are external, so a throw here is expected shape, not
      // a bug on our side: treat it as a failed probe.
      logger.info(
        {
          err: normalizeError(err),
          modelId: endpoint.modelId,
          providerId: endpoint.providerId,
          host: endpoint.host,
          attempt,
        },
        "Model health probe threw"
      );
      return false;
    }

    if (!healthy) {
      return false;
    }
  }

  return true;
}
