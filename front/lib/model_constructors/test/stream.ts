import * as fs from "node:fs";
import * as path from "node:path";

import type { StreamModelConfiguration } from "@app/lib/model_constructors/stream/configuration";
import type { StreamEndpoint } from "@app/lib/model_constructors/stream/endpoint";
import type { InputConfig } from "@app/lib/model_constructors/types/input/configuration";
import type { Payload } from "@app/lib/model_constructors/types/input/messages";
import {
  buildErrorEvent,
  type LargeLanguageModelResponseEvent,
} from "@app/lib/model_constructors/types/output/events";

// Drives a stream endpoint end to end, mirroring what a production `stream()`
// orchestrator will eventually do: validate the config against the endpoint's
// `configSchema` (emitting an `input_configuration_error` event on failure, like
// the real pipeline), build the provider payload, stream it, and convert the raw
// stream into unified events. Lives in the test harness because the refactor does
// not expose a high-level `stream()` yet; once it does, this should delegate to
// it instead of re-implementing the pipeline.
//
// When `debug` is set, the input, built payload, raw provider events, and
// converted events are dumped to JSON files in the working directory — handy for
// inspecting a single failing case without re-running against the provider.
export async function* runStream(
  instance: StreamEndpoint<any, any>,
  configSchema: StreamModelConfiguration["configSchema"],
  payload: Payload,
  config: InputConfig,
  { debug = false }: { debug?: boolean } = {}
): AsyncGenerator<LargeLanguageModelResponseEvent> {
  const configValidationResult = configSchema.safeParse(config);
  if (!configValidationResult.success) {
    yield buildErrorEvent({
      metadata: instance.metadata(),
      type: "input_configuration_error",
      message: "Configuration is invalid.",
      originalError: configValidationResult.error.format(),
    });
    return;
  }

  const input = instance.buildRequestPayload(
    payload,
    configValidationResult.data
  );

  if (!debug) {
    yield* instance.rawStreamOutputToEvents(instance.streamRaw(input));
    return;
  }

  const dateString = new Date().toISOString();
  await fs.promises.writeFile(
    path.join(process.cwd(), `${dateString}_1_input.json`),
    JSON.stringify({ payload, config }, null, 2),
    "utf8"
  );
  await fs.promises.writeFile(
    path.join(process.cwd(), `${dateString}_2_payload.json`),
    JSON.stringify(input, null, 2),
    "utf8"
  );

  const rawEvents: unknown[] = [];
  const convertedEvents: LargeLanguageModelResponseEvent[] = [];

  async function* tapRaw(
    stream: AsyncGenerator<unknown>
  ): AsyncGenerator<unknown> {
    for await (const event of stream) {
      rawEvents.push(event);
      yield event;
    }
  }

  try {
    for await (const event of instance.rawStreamOutputToEvents(
      tapRaw(instance.streamRaw(input))
    )) {
      convertedEvents.push(event);
      yield event;
    }
  } finally {
    await fs.promises.writeFile(
      path.join(process.cwd(), `${dateString}_3_raw_output.json`),
      JSON.stringify(rawEvents, null, 2),
      "utf8"
    );
    await fs.promises.writeFile(
      path.join(process.cwd(), `${dateString}_4_converted_output.json`),
      JSON.stringify(convertedEvents, null, 2),
      "utf8"
    );
  }
}
