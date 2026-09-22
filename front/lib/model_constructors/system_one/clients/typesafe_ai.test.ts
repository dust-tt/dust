// @vitest-environment node

import assert from "node:assert";
import { TypesafeAiJevGlobalTypesafeAiSystemOne } from "@app/lib/model_constructors/system_one/endpoints/typesafe_ai_jev_global_typesafe_ai";
import type { Credentials } from "@app/lib/model_constructors/types/credentials";
import { choice, noul } from "@typesafe-ai/sdk";
import { afterEach, describe, expect, it } from "vitest";

type RecordedRequest = { url: string; headers: Headers; body: unknown };

function buildEndpoint({
  status = 200,
  body = ANSWERS_BODY,
  credentials = { TYPESAFE_AI_API_KEY: "workspace-key" },
}: {
  status?: number;
  body?: unknown;
  credentials?: Credentials;
} = {}) {
  const requests: RecordedRequest[] = [];
  const endpoint = new TypesafeAiJevGlobalTypesafeAiSystemOne(
    credentials,
    async (url, init) => {
      requests.push({
        url,
        headers: new Headers(init?.headers),
        body: JSON.parse(String(init?.body)),
      });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    }
  );
  return { endpoint, requests };
}

const TICKET = "I was charged twice. Please fix this ASAP.";

const QUESTIONS = {
  billing: noul("Is this about billing?"),
  category: choice("What is this ticket about?", {
    billing: null,
    technical: null,
    other: null,
  }),
};

const ANSWERS_BODY = {
  model: "jev-latest",
  answers: {
    billing: { type: "noul", noul: 0.93 },
    category: {
      type: "choice",
      choice: "billing",
      confidence: 0.88,
      probabilities: { billing: 0.88, technical: 0.08, other: 0.04 },
    },
  },
  usage: { input_tokens: 142, output_tokens: 7 },
};

describe("TypesafeAiJevGlobalTypesafeAiSystemOne", () => {
  afterEach(() => {
    delete process.env.TYPESAFE_API_KEY;
  });

  it("returns the answer for each named question", async () => {
    const { endpoint } = buildEndpoint();

    const res = await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    assert(res.isOk(), "expected the call to succeed");
    expect(res.value.answers.billing.noul).toBe(0.93);
    expect(res.value.answers.category.choice).toBe("billing");
  });

  it("reports token usage and the endpoint identity alongside the answers", async () => {
    const { endpoint } = buildEndpoint();

    const res = await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    assert(res.isOk(), "expected the call to succeed");
    expect(res.value.usage).toEqual({
      longCacheCreated: 0,
      shortCacheCreated: 0,
      cacheCreated: 0,
      cacheHit: 0,
      standardInput: 142,
      totalOutput: 7,
    });
    expect(res.value.metadata).toEqual({
      lab: "typesafe_ai",
      host: "typesafe-ai",
      region: "global",
      model: "jev-latest",
    });
  });

  it("posts the state and questions to the system-one route under the endpoint's model", async () => {
    const { endpoint, requests } = buildEndpoint();

    await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    const [request] = requests;
    assert(request, "expected exactly one request");
    expect(request.url).toBe("https://api.typesafe.ai/v1/systemone");
    expect(request.body).toEqual({
      state: TICKET,
      questions: QUESTIONS,
      model: "jev-latest",
    });
  });

  it("authenticates with the api key from the credentials", async () => {
    const { endpoint, requests } = buildEndpoint();

    await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    const [request] = requests;
    assert(request, "expected exactly one request");
    expect(request.headers.get("authorization")).toBe("Bearer workspace-key");
  });

  it("never falls back to an ambient TYPESAFE_API_KEY when the credentials carry none", async () => {
    process.env.TYPESAFE_API_KEY = "ambient-key";
    const { endpoint, requests } = buildEndpoint({ credentials: {} });

    await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    const [request] = requests;
    assert(request, "expected exactly one request");
    expect(request.headers.get("authorization")).not.toContain("ambient-key");
  });

  it("maps a rejected api key to an authentication error owned by dust", async () => {
    const { endpoint } = buildEndpoint({
      status: 401,
      body: { error: { message: "invalid api key" } },
    });

    const res = await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    assert(res.isErr(), "expected the call to fail");
    expect(res.error.type).toBe("authentication_error");
    expect(res.error.errorSource).toBe("dust");
  });

  it("maps a 500 to a server error owned by the provider", async () => {
    const { endpoint } = buildEndpoint({
      status: 500,
      body: { error: { message: "boom" } },
    });

    const res = await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    assert(res.isErr(), "expected the call to fail");
    expect(res.error.type).toBe("server_error");
    expect(res.error.errorSource).toBe("provider");
  });

  it("maps an unreachable api to a network error", async () => {
    const endpoint = new TypesafeAiJevGlobalTypesafeAiSystemOne(
      { TYPESAFE_AI_API_KEY: "workspace-key" },
      async () => {
        throw Object.assign(new TypeError("fetch failed"), {
          code: "ECONNREFUSED",
        });
      }
    );

    const res = await endpoint.answer({ state: TICKET, questions: QUESTIONS });

    assert(res.isErr(), "expected the call to fail");
    expect(res.error.type).toBe("network_error");
  });

  it("returns an invalid request error instead of throwing when no question is asked", async () => {
    const { endpoint, requests } = buildEndpoint();

    const res = await endpoint.answer({ state: TICKET, questions: {} });

    assert(res.isErr(), "expected the call to fail");
    expect(res.error.type).toBe("invalid_request_error");
    expect(requests).toHaveLength(0);
  });
});
