// @vitest-environment node

import { STREAM_ENDPOINTS } from "@app/lib/model_constructors/stream";
import type { StreamEndpointConstructor } from "@app/lib/model_constructors/stream/configuration";
import { OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream } from "@app/lib/model_constructors/stream/endpoints/openai_gpt_five_dot_six_terra_global_openai_responses";
import { OPENAI_RESPONSES_HOST } from "@app/lib/model_constructors/types/hosts";
import { APIConnectionTimeoutError } from "openai";
import type {
  ResponseCreateParams,
  ResponseCreateParamsStreaming,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";
import { describe, expect, it } from "vitest";

const flexEndpoint = OpenAIGptFiveDotSixTerraGlobalOpenAIResponsesStream;

type ServiceTier = ResponseCreateParamsStreaming["service_tier"];

const EMPTY_CONVERSATION = { conversation: { system: [], messages: [] } };

// Returns `unknown` so callers read the one field under test rather than
// narrowing to a single client's request type.
function buildPayload(
  Endpoint: StreamEndpointConstructor,
  config: unknown
): unknown {
  const instance = new Endpoint({ OPENAI_API_KEY: "test" });

  return instance.buildRequestPayload(
    EMPTY_CONVERSATION,
    Endpoint.configSchema.parse(config)
  );
}

// Partitioned from the registry rather than listed here, so a new OpenAI
// Responses endpoint is covered by whichever side of the flag it declares.
const openAIResponsesEndpoints: [string, StreamEndpointConstructor][] =
  Object.entries(STREAM_ENDPOINTS).filter(
    ([, { host }]) => host === OPENAI_RESPONSES_HOST
  );
const flexEndpoints = openAIResponsesEndpoints.filter(
  ([, { supportsFlexProcessing }]) => supportsFlexProcessing === true
);
const standardOnlyEndpoints = openAIResponsesEndpoints.filter(
  ([, { supportsFlexProcessing }]) => supportsFlexProcessing !== true
);

describe("OpenAIResponsesStream flex support declarations", () => {
  // An empty partition would make the `it.each` blocks below silently vacuous.
  it("partitions the endpoints on both sides of the flag", () => {
    expect(flexEndpoints.length).toBeGreaterThan(0);
    expect(standardOnlyEndpoints.length).toBeGreaterThan(0);
  });

  it("omits the tier when none is requested", () => {
    expect(buildPayload(flexEndpoint, {})).not.toHaveProperty("service_tier");
  });

  it.each(flexEndpoints)("requests flex on %s", (_id, Endpoint) => {
    expect(buildPayload(Endpoint, { serviceTier: "flex" })).toMatchObject({
      service_tier: "flex",
    });
  });

  it.each(
    standardOnlyEndpoints
  )("accepts the config but does not request flex on %s", (_id, Endpoint) => {
    expect(buildPayload(Endpoint, { serviceTier: "flex" })).not.toMatchObject({
      service_tier: "flex",
    });
  });
});

function textDelta(delta: string): ResponseStreamEvent {
  return {
    type: "response.output_text.delta",
    delta,
    content_index: 0,
    item_id: "item",
    output_index: 0,
    sequence_number: 0,
    logprobs: [],
  };
}

type RequestOptions = { maxRetries: number; timeout: number };

// One call to the OpenAI SDK: the tier asked for, and the per-request overrides
// deciding how long we wait on it.
interface Attempt {
  tier: ServiceTier;
  stream: boolean | undefined;
  options: RequestOptions | undefined;
}

// Stands in for the transport only, recording every attempt and replaying
// whatever the test scripted for that tier.
class FakeOpenAIResponsesStream extends flexEndpoint {
  readonly attempts: Attempt[] = [];

  constructor(
    private readonly respond: (
      tier: ServiceTier
    ) => AsyncGenerator<ResponseStreamEvent>
  ) {
    super({ OPENAI_API_KEY: "test" });
  }

  get attemptedTiers(): ServiceTier[] {
    return this.attempts.map(({ tier }) => tier);
  }

  protected override async *streamFromOpenAI(
    input: ResponseCreateParamsStreaming,
    options?: RequestOptions
  ): AsyncGenerator<ResponseStreamEvent> {
    this.attempts.push({
      tier: input.service_tier,
      stream: input.stream,
      options,
    });
    yield* this.respond(input.service_tier);
  }
}

// The default input is a payload the real endpoint built, so every test below
// also covers the seam: that tier is all `streamRaw` has to go on.
const flexPayload: ResponseCreateParams = new flexEndpoint({
  OPENAI_API_KEY: "test",
}).buildRequestPayload(
  EMPTY_CONVERSATION,
  flexEndpoint.configSchema.parse({ serviceTier: "flex" })
);

async function streamRequest(
  respond: (tier: ServiceTier) => AsyncGenerator<ResponseStreamEvent>,
  input: ResponseCreateParams = flexPayload
) {
  const instance = new FakeOpenAIResponsesStream(respond);
  const deltas: string[] = [];
  let error: unknown = null;

  try {
    for await (const event of instance.streamRaw(input)) {
      if (event.type === "response.output_text.delta") {
        deltas.push(event.delta);
      }
    }
  } catch (err) {
    error = err;
  }

  const { attempts, attemptedTiers } = instance;

  return { deltas, error, attempts, attemptedTiers };
}

describe("OpenAIResponsesStream flex fallback", () => {
  it("streams the flex attempt when flex delivers", async () => {
    const { deltas, error, attemptedTiers } = await streamRequest(
      async function* () {
        yield textDelta("flex-1");
        yield textDelta("flex-2");
      }
    );

    expect(deltas).toEqual(["flex-1", "flex-2"]);
    expect(error).toBeNull();
    expect(attemptedTiers).toEqual(["flex"]);
  });

  // The timeout is what turns "flex answers too late" into a fallback rather
  // than a hang, and `maxRetries: 0` stops the SDK retrying a tier that is
  // refusing us. The replay drops both: it is the attempt that must succeed.
  it("replays on standard processing when flex fails before the first event", async () => {
    const { deltas, error, attempts } = await streamRequest(
      async function* (tier) {
        if (tier === "flex") {
          throw new APIConnectionTimeoutError();
        }
        yield textDelta("standard-1");
      }
    );

    expect(deltas).toEqual(["standard-1"]);
    expect(error).toBeNull();
    expect(attempts).toEqual([
      {
        tier: "flex",
        stream: true,
        options: { maxRetries: 0, timeout: 30_000 },
      },
      { tier: "auto", stream: true, options: undefined },
    ]);
  });

  it("propagates a failure after the first event instead of replaying", async () => {
    const { deltas, error, attemptedTiers } = await streamRequest(
      async function* () {
        yield textDelta("flex-1");
        throw new Error("stream broke");
      }
    );

    expect(deltas).toEqual(["flex-1"]);
    expect(error).toBeInstanceOf(Error);
    expect(attemptedTiers).toEqual(["flex"]);
  });
});
