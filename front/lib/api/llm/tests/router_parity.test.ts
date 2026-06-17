// @vitest-environment node
//
// Regression test: the new per-endpoint LLM router (model_constructors, surfaced
// through `StreamEndpointTransition`) must dispatch the same request to the
// remote provider SDK as the legacy per-provider router, for identical inputs.
//
// Both routers are driven through the public `LLM.stream()`; the provider SDKs
// are mocked so each `.stream()` call records its argument instead of hitting
// the network. We then compare the captured request objects with a strict
// `toEqual`, after subtracting a documented allow-list of intentional diffs.
//
// Coverage is driven by the endpoint registry (`DUST_STREAM_ENDPOINTS`), so new
// providers/models are picked up automatically once their adapter + SDK mock +
// normalizer are added.
//
// Local-only (gated on RUN_LLM_TEST, like the other LLM suites) — it does not
// hit the network, but it currently documents known legacy<->new divergences
// and so is kept out of CI. Run with:
//   NODE_ENV=test RUN_LLM_TEST=true npx vitest \
//     --config lib/api/llm/tests/vite.config.js \
//     lib/api/llm/tests/router_parity.test.ts --run

import { createMockAuthenticator } from "@app/lib/api/llm/tests/conversations";
import { normalizeRequest } from "@app/lib/api/llm/tests/parity/allowlist";
import { buildParityMatrix } from "@app/lib/api/llm/tests/parity/matrix";
import type { SdkCaptures } from "@app/lib/api/llm/tests/parity/providers";
import {
  getParityProvider,
  PARITY_CREDENTIALS,
  readEndpointInfo,
} from "@app/lib/api/llm/tests/parity/providers";
import { StreamEndpointTransition } from "@app/lib/api/llm/transitionLLM";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import { DUST_STREAM_ENDPOINTS } from "@app/lib/llms/stream";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Hoisted SDK capture kit. The mocked Anthropic / Vertex clients record the
// argument passed to `.messages.stream` (GA, used by the new router) and
// `.beta.messages.stream` (Beta, used by the legacy router) into `captures`.
const kit = vi.hoisted(() => {
  const captures = {
    anthropic: { ga: [] as unknown[], beta: [] as unknown[] },
    vertex: { ga: [] as unknown[], beta: [] as unknown[] },
  };
  const emptyStream = () => (async function* () {})();
  const makeClient = (bucket: "anthropic" | "vertex") =>
    class {
      messages = {
        stream: (input: unknown) => {
          captures[bucket].ga.push(input);
          return emptyStream();
        },
      };
      beta = {
        messages: {
          stream: (input: unknown) => {
            captures[bucket].beta.push(input);
            return emptyStream();
          },
        },
      };
    };
  return { captures, makeClient };
});

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  return { ...actual, default: kit.makeClient("anthropic") };
});

vi.mock("@anthropic-ai/vertex-sdk", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@anthropic-ai/vertex-sdk")>();
  return { ...actual, default: kit.makeClient("vertex") };
});

function resetCaptures(c: SdkCaptures): void {
  c.anthropic.ga.length = 0;
  c.anthropic.beta.length = 0;
  c.vertex.ga.length = 0;
  c.vertex.beta.length = 0;
}

async function drain(gen: AsyncGenerator<unknown>): Promise<Error | undefined> {
  try {
    for await (const _ of gen) {
      // discard events; we only care about the captured request payload
    }
    return undefined;
  } catch (err) {
    return normalizeError(err);
  }
}

const ENDPOINTS = Object.values(DUST_STREAM_ENDPOINTS).map(readEndpointInfo);
const MATRIX = buildParityMatrix();

describe.skipIf(process.env.RUN_LLM_TEST !== "true")(
  "LLM router request parity (legacy vs new)",
  () => {
    beforeAll(() => {
      // The legacy Vertex path reads the project id from config at construction.
      vi.stubEnv("VERTEX_AI_PROJECT_ID", "test-project");
    });
    afterAll(() => {
      vi.unstubAllEnvs();
    });

    for (const endpoint of ENDPOINTS) {
      const provider = getParityProvider(endpoint.providerId);
      const modelId = provider.toModelId(endpoint.modelId);

      describe(endpoint.id, () => {
        for (const testCase of MATRIX) {
          it(testCase.label, async () => {
            resetCaptures(kit.captures);
            const auth = createMockAuthenticator();

            const params: LLMParameters = {
              credentials: PARITY_CREDENTIALS,
              modelId,
              temperature: testCase.temperature,
              reasoningEffort: testCase.reasoningEffort,
              responseFormat: testCase.responseFormat,
              bypassFeatureFlag: true,
            };

            const oldLLM = provider.buildLegacyLLM(auth, endpoint, {
              modelId: endpoint.modelId,
              temperature: testCase.temperature,
              reasoningEffort: testCase.reasoningEffort,
              responseFormat: testCase.responseFormat,
            });
            const newLLM = new StreamEndpointTransition(
              auth,
              params,
              endpoint.ctor
            );

            const oldErr = await drain(
              oldLLM.stream(testCase.streamParameters)
            );
            const newErr = await drain(
              newLLM.stream(testCase.streamParameters)
            );

            const oldReq = provider.selectOldRequest(endpoint, kit.captures);
            const newReq = provider.selectNewRequest(endpoint, kit.captures);

            expect(oldErr, `legacy stream threw: ${oldErr?.message}`).toBe(
              undefined
            );
            expect(
              oldReq,
              "legacy router did not dispatch a request"
            ).toBeDefined();
            expect(newErr, `new stream threw: ${newErr?.message}`).toBe(
              undefined
            );
            expect(
              newReq,
              "new router did not dispatch a request"
            ).toBeDefined();

            expect(normalizeRequest(endpoint.providerId, newReq)).toEqual(
              normalizeRequest(endpoint.providerId, oldReq)
            );
          });
        }
      });
    }
  }
);
