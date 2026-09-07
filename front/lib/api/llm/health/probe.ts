import {
  PROBE_TIMEOUT_MS,
  PROBES_PER_RECOVERY,
} from "@app/lib/api/llm/health/config";
import { dangerouslyGetDustManagedLlmCredentials } from "@app/lib/api/provider_credentials";
import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import type { DustStreamEndpointConstructor } from "@app/lib/llms/stream/dust_stream_endpoint";
import type { DegradedModelEndpointType } from "@app/lib/model_constructors/types/degradations";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import logger from "@app/logger/logger";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";

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
 * The cheapest config an endpoint will accept. Reasoning off where possible,
 * running `configParsers` before `parse` as `buildConfig` does in transitionLLM,
 * and falling back to the schema defaults when `none` is refused.
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
 * One synthetic inference against a live endpoint. Bypasses `LLM` so a probe
 * writes no `Run`, usage, trace or counter, and never feeds the signal it
 * measures. Resolves on the first event -- reasoning included -- then stops the
 * generation, with `PROBE_TIMEOUT_MS` bounding an endpoint that streams nothing.
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

  const firstEvent = (async (): Promise<boolean> => {
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
          case "response_id":
          case "tool_call_started":
          case "tool_call_delta":
          case "tool_call":
          case "provider_passthrough":
          case "token_usage":
            // Not evidence the endpoint can generate: keep waiting.
            continue;
          default:
            assertNeverAndIgnore(event);
            continue;
        }
      }
    } finally {
      // Stops the provider stream when we returned before it ended.
      await events.return(undefined);
    }

    // Closed without a terminal event: not healthy.
    return false;
  })();

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<"timeout">((resolve) => {
    timeoutHandle = setTimeout(() => resolve("timeout"), PROBE_TIMEOUT_MS);
  });

  let raced;
  try {
    raced = await Promise.race([firstEvent, timeoutPromise]);
  } finally {
    clearTimeout(timeoutHandle);
  }

  if (raced !== "timeout") {
    return raced;
  }

  logger.info(
    {
      modelId: endpoint.modelConfig.modelId,
      providerId: endpoint.modelConfig.providerId,
      modelHost: endpoint.host,
      timeoutMs: PROBE_TIMEOUT_MS,
    },
    "Model health probe timed out"
  );

  // Queued behind the in-flight `next()`, so awaiting it would reintroduce the
  // hang the deadline bounds.
  void events.return(undefined);
  // Swallow a late rejection from the abandoned generator.
  firstEvent.catch(() => {});

  return false;
}

/**
 * A recovery round: `PROBES_PER_RECOVERY` probes that must all succeed. Run
 * sequentially so an intermittent provider cannot pass on a lucky burst.
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
        modelHost: endpoint.host,
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
      // Provider SDKs are external: a throw is a failed probe, not a bug.
      logger.info(
        {
          err: normalizeError(err),
          modelId: endpoint.modelId,
          providerId: endpoint.providerId,
          modelHost: endpoint.host,
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
