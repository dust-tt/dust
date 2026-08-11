import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  runWithInvocationEnv,
  TOOLS_API_URL_ENV,
  TOOLS_SANDBOX_TOKEN_ENV,
  ToolCallError,
  ToolCallResult,
  tools,
} from "@dust/pod";

const BASE_URL = "https://front.test/api/v1/w/w_test";

// The server-view resolution cache is keyed by token and persists for the
// process (module state), so every test uses a unique token to stay isolated.
let tokenCounter = 0;
function uniqueToken(): string {
  tokenCounter += 1;
  return `sandbox-token-${tokenCounter}`;
}

interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

type FetchHandler = (request: RecordedRequest) => Response | Promise<Response>;

let requests: RecordedRequest[];
let handler: FetchHandler;

const realFetch = globalThis.fetch;

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function serverViewsResponse(views: { sId: string; name: string }[]): Response {
  return jsonResponse(200, {
    serverViews: views.map(({ sId, name }) => ({
      sId,
      server: { name, sId: `srv_${name}`, tools: [] },
    })),
  });
}

/**
 * Route requests like the front sandbox-actions API: GET /sandbox/actions
 * lists server views, POST /sandbox/actions/call creates an action, GET
 * /sandbox/actions/{aId} polls it. Tests override `handler` (or the
 * per-route helpers' response queues) to shape each scenario.
 */
function installFetchMock(): void {
  const mocked: typeof fetch = Object.assign(
    async (input: string | URL | Request, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const headers: Record<string, string> = {};
      for (const [key, value] of new Headers(init?.headers).entries()) {
        headers[key] = value;
      }
      const request: RecordedRequest = {
        method: init?.method ?? "GET",
        url,
        headers,
        body:
          typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
      };
      requests.push(request);
      return handler(request);
    },
    { preconnect: realFetch.preconnect }
  );
  globalThis.fetch = mocked;
}

/** Sequence responses: each call consumes the next entry; the last repeats. */
function sequence(...responses: (Response | Error)[]): FetchHandler {
  let index = 0;
  return () => {
    const step = responses[Math.min(index, responses.length - 1)];
    index += 1;
    if (step instanceof Error) {
      throw step;
    }
    // Response bodies are single-use; clone so a repeated final entry works.
    return step.clone();
  };
}

/**
 * Standard happy-path routing: resolution finds `serverName`, the call
 * returns `actionId`, and polling replays `pollResponses` in order (last
 * repeats).
 */
function routeToolCall({
  serverName,
  viewId,
  actionId,
  pollResponses,
}: {
  serverName: string;
  viewId: string;
  actionId: string;
  pollResponses: (Response | Error)[];
}): void {
  const poll = sequence(...pollResponses);
  handler = (request) => {
    if (request.method === "GET" && request.url.includes("?server=")) {
      return serverViewsResponse([{ sId: viewId, name: serverName }]);
    }
    if (request.method === "POST" && request.url.endsWith("/actions/call")) {
      return jsonResponse(202, { status: "pending", actionId });
    }
    if (request.method === "GET" && request.url.endsWith(`/${actionId}`)) {
      return poll(request);
    }
    throw new Error(`Unexpected request: ${request.method} ${request.url}`);
  };
}

function successPoll(
  output: unknown[],
  {
    actionStatus = "succeeded",
    structuredContent,
  }: { actionStatus?: string; structuredContent?: unknown } = {}
): Response {
  return jsonResponse(200, {
    status: "success",
    action: {
      status: actionStatus,
      output,
      ...(structuredContent === undefined ? {} : { structuredContent }),
    },
  });
}

async function expectToolCallError(
  promise: Promise<unknown>
): Promise<ToolCallError> {
  try {
    await promise;
  } catch (err) {
    expect(err).toBeInstanceOf(ToolCallError);
    if (err instanceof ToolCallError) {
      return err;
    }
  }
  throw new Error("Expected the call to throw a ToolCallError");
}

beforeEach(() => {
  requests = [];
  handler = () => {
    throw new Error("No fetch handler installed for this test");
  };
  installFetchMock();
  process.env[TOOLS_API_URL_ENV] = BASE_URL;
  process.env[TOOLS_SANDBOX_TOKEN_ENV] = uniqueToken();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env[TOOLS_API_URL_ENV];
  delete process.env[TOOLS_SANDBOX_TOKEN_ENV];
});

describe("tools.call", () => {
  test("resolves the server, POSTs JSON args verbatim, and returns the result", async () => {
    routeToolCall({
      serverName: "slack_personal",
      viewId: "msv_1",
      actionId: "act_1",
      pollResponses: [successPoll([{ type: "text", text: "hello" }])],
    });

    const args = {
      query: "release notes",
      limit: 20,
      exhaustive: false,
      channels: ["C123", "C456"],
      filter: { after: "2026-01-01" },
    };
    const result = await tools.call("slack_personal", "search_messages", args);

    expect(result).toBeInstanceOf(ToolCallResult);
    expect(result.isError).toBe(false);
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(result.structuredContent).toBeUndefined();

    // Wire shape: server resolution, then the call with args as a real JSON
    // object (numbers stay numbers, booleans stay booleans, no __file__).
    const [listRequest, callRequest] = requests;
    expect(listRequest?.url).toBe(
      `${BASE_URL}/sandbox/actions?server=slack_personal&light=true`
    );
    expect(callRequest?.url).toBe(`${BASE_URL}/sandbox/actions/call`);
    expect(callRequest?.body).toEqual({
      serverViewId: "msv_1",
      toolName: "search_messages",
      arguments: args,
    });
    expect(callRequest?.headers["authorization"]).toBe(
      `Bearer ${process.env[TOOLS_SANDBOX_TOKEN_ENV]}`
    );
  });

  test("omitted args are sent as an empty object", async () => {
    routeToolCall({
      serverName: "fathom",
      viewId: "msv_f",
      actionId: "act_f",
      pollResponses: [successPoll([])],
    });

    await tools.call("fathom", "list_meetings");

    const callRequest = requests.find((r) => r.method === "POST");
    expect(callRequest?.body).toEqual({
      serverViewId: "msv_f",
      toolName: "list_meetings",
      arguments: {},
    });
  });

  test("keeps polling while the action is pending", async () => {
    routeToolCall({
      serverName: "hubspot",
      viewId: "msv_h",
      actionId: "act_h",
      pollResponses: [
        jsonResponse(202, { status: "pending", actionId: "act_h" }),
        successPoll([{ type: "text", text: "done" }]),
      ],
    });

    const result = await tools.call("hubspot", "search_crm_objects", {
      query: "acme",
    });

    expect(result.text()).toBe("done");
    const polls = requests.filter((r) => r.url.endsWith("/act_h"));
    expect(polls.length).toBe(2);
  });

  test("an errored action resolves with isError true instead of throwing", async () => {
    routeToolCall({
      serverName: "hubspot",
      viewId: "msv_h",
      actionId: "act_err",
      pollResponses: [
        successPoll([{ type: "text", text: "boom" }], {
          actionStatus: "errored",
        }),
      ],
    });

    const result = await tools.call("hubspot", "search_crm_objects", {});
    expect(result.isError).toBe(true);
    expect(result.text()).toBe("boom");
  });

  test("a rejected action throws a terminal `rejected` error", async () => {
    routeToolCall({
      serverName: "hubspot",
      viewId: "msv_h",
      actionId: "act_rej",
      pollResponses: [jsonResponse(403, { status: "rejected" })],
    });

    const error = await expectToolCallError(
      tools.call("hubspot", "search_crm_objects", {})
    );
    expect(error.code).toBe("rejected");
    expect(error.retryable).toBe(false);
  });

  test("passes structuredContent through when the platform delivers one", async () => {
    const structured = { meetings: [{ id: 1 }], nextCursor: null };
    routeToolCall({
      serverName: "fathom",
      viewId: "msv_f",
      actionId: "act_s",
      pollResponses: [
        successPoll([{ type: "text", text: "1 meeting" }], {
          structuredContent: structured,
        }),
      ],
    });

    const result = await tools.call("fathom", "list_meetings", {});
    expect(result.structuredContent).toEqual(structured);
    expect(result.json()).toEqual(structured);
  });
});

describe("environment handling", () => {
  test("throws missing_env without DUST_API_URL", async () => {
    delete process.env[TOOLS_API_URL_ENV];
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("missing_env");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain(TOOLS_API_URL_ENV);
    expect(requests.length).toBe(0);
  });

  test("throws missing_env without DUST_SANDBOX_TOKEN", async () => {
    delete process.env[TOOLS_SANDBOX_TOKEN_ENV];
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("missing_env");
    expect(error.message).toContain(TOOLS_SANDBOX_TOKEN_ENV);
  });

  test("reads the invocation context env, not process.env, inside a context", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_ctx",
      actionId: "act_ctx",
      pollResponses: [successPoll([])],
    });

    const contextToken = uniqueToken();
    await runWithInvocationEnv(
      {
        [TOOLS_API_URL_ENV]: BASE_URL,
        [TOOLS_SANDBOX_TOKEN_ENV]: contextToken,
      },
      () => tools.call("slack", "search", {})
    );

    // Every request authenticates with the context token even though
    // process.env carries a different one.
    for (const request of requests) {
      expect(request.headers["authorization"]).toBe(`Bearer ${contextToken}`);
    }
  });
});

describe("server-name resolution", () => {
  test("throws server_not_found when the server is not available", async () => {
    handler = () => serverViewsResponse([]);
    const error = await expectToolCallError(
      tools.call("nonexistent", "some_tool", {})
    );
    expect(error.code).toBe("server_not_found");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("nonexistent");
  });

  test("caches resolution per invocation token", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_c",
      actionId: "act_c",
      pollResponses: [successPoll([])],
    });

    await tools.call("slack", "search", {});
    await tools.call("slack", "list", {});

    const listings = requests.filter((r) => r.url.includes("?server="));
    expect(listings.length).toBe(1);
  });

  test("a new invocation token re-resolves", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_c",
      actionId: "act_c",
      pollResponses: [successPoll([])],
    });

    await tools.call("slack", "search", {});
    process.env[TOOLS_SANDBOX_TOKEN_ENV] = uniqueToken();
    await tools.call("slack", "search", {});

    const listings = requests.filter((r) => r.url.includes("?server="));
    expect(listings.length).toBe(2);
  });

  test("a failed resolution is not cached", async () => {
    let listCalls = 0;
    handler = (request) => {
      if (request.url.includes("?server=")) {
        listCalls += 1;
        if (listCalls === 1) {
          return jsonResponse(500, {
            error: { type: "internal_server_error", message: "boom" },
          });
        }
        return serverViewsResponse([{ sId: "msv_r", name: "slack" }]);
      }
      if (request.method === "POST") {
        return jsonResponse(202, { status: "pending", actionId: "act_r" });
      }
      return successPoll([]);
    };

    const first = await expectToolCallError(tools.call("slack", "search", {}));
    expect(first.code).toBe("server_error");
    expect(first.retryable).toBe(true);

    const result = await tools.call("slack", "search", {});
    expect(result.isError).toBe(false);
    expect(listCalls).toBe(2);
  });

  test("a network failure during resolution is retryable", async () => {
    handler = () => {
      throw new TypeError("Unable to connect");
    };
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("network_error");
    expect(error.retryable).toBe(true);
  });
});

describe("HTTP error classification", () => {
  async function callFailingWith(status: number, body: unknown) {
    handler = (request) => {
      if (request.url.includes("?server=")) {
        return serverViewsResponse([{ sId: "msv_e", name: "slack" }]);
      }
      return jsonResponse(status, body);
    };
    return expectToolCallError(tools.call("slack", "search", {}));
  }

  test("401 -> invalid_token, terminal (per-invocation JWT)", async () => {
    const error = await callFailingWith(401, {
      error: {
        type: "invalid_sandbox_token_error",
        message: "The sandbox token is invalid or expired.",
      },
    });
    expect(error.code).toBe("invalid_token");
    expect(error.retryable).toBe(false);
    expect(error.status).toBe(401);
  });

  test("403 -> permission_denied surfacing front's message", async () => {
    const error = await callFailingWith(403, {
      error: {
        type: "invalid_request_error",
        message:
          "This Pod function is published as fast and cannot call tools. " +
          "Publish it with executionMode `durable` to let it call tools.",
      },
    });
    expect(error.code).toBe("permission_denied");
    expect(error.retryable).toBe(false);
    expect(error.message).toContain("published as fast");
  });

  test("400 -> invalid_request", async () => {
    const error = await callFailingWith(400, {
      error: { type: "invalid_request_error", message: "Unknown tool." },
    });
    expect(error.code).toBe("invalid_request");
    expect(error.retryable).toBe(false);
  });

  test("404 -> not_found", async () => {
    const error = await callFailingWith(404, {
      error: { type: "invalid_request_error", message: "No such view." },
    });
    expect(error.code).toBe("not_found");
    expect(error.retryable).toBe(false);
  });

  test("429 -> rate_limited, retryable", async () => {
    const error = await callFailingWith(429, {
      error: { type: "rate_limit_error", message: "Slow down." },
    });
    expect(error.code).toBe("rate_limited");
    expect(error.retryable).toBe(true);
  });

  test("a non-JSON error body is classified by status with a snippet", async () => {
    handler = (request) => {
      if (request.url.includes("?server=")) {
        return serverViewsResponse([{ sId: "msv_e", name: "slack" }]);
      }
      return new Response("Bad Gateway", { status: 502 });
    };
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("server_error");
    expect(error.retryable).toBe(true);
    expect(error.message).toContain("Bad Gateway");
  });

  test("a network failure on the POST is not retryable (call may exist)", async () => {
    handler = (request) => {
      if (request.url.includes("?server=")) {
        return serverViewsResponse([{ sId: "msv_e", name: "slack" }]);
      }
      throw new TypeError("socket closed");
    };
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("network_error");
    expect(error.retryable).toBe(false);
  });

  test("an unparseable success body is invalid_response", async () => {
    handler = (request) => {
      if (request.url.includes("?server=")) {
        return serverViewsResponse([{ sId: "msv_e", name: "slack" }]);
      }
      return new Response("not json", { status: 200 });
    };
    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("invalid_response");
    expect(error.retryable).toBe(false);
  });
});

describe("polling resilience", () => {
  test("retries transient network errors while polling, then succeeds", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_p",
      actionId: "act_p",
      pollResponses: [
        new TypeError("connection reset"),
        successPoll([{ type: "text", text: "recovered" }]),
      ],
    });

    const result = await tools.call("slack", "search", {});
    expect(result.text()).toBe("recovered");
    const polls = requests.filter((r) => r.url.endsWith("/act_p"));
    expect(polls.length).toBe(2);
  });

  test("an API error while polling is terminal, not retried", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_p",
      actionId: "act_term",
      pollResponses: [
        jsonResponse(404, {
          error: { type: "action_not_found", message: "Action not found." },
        }),
      ],
    });

    const error = await expectToolCallError(tools.call("slack", "search", {}));
    expect(error.code).toBe("not_found");
    const polls = requests.filter((r) => r.url.endsWith("/act_term"));
    expect(polls.length).toBe(1);
  });

  test("times out when the action stays pending past the deadline", async () => {
    routeToolCall({
      serverName: "slack",
      viewId: "msv_p",
      actionId: "act_slow",
      pollResponses: [
        jsonResponse(202, { status: "pending", actionId: "act_slow" }),
      ],
    });

    const error = await expectToolCallError(
      tools.call("slack", "search", {}, { timeoutMs: 0 })
    );
    expect(error.code).toBe("timeout");
    expect(error.retryable).toBe(false);
  });
});

describe("ToolCallResult helpers", () => {
  test("text() concatenates text blocks and text resources", () => {
    const result = new ToolCallResult({
      content: [
        { type: "text", text: "first" },
        { type: "image", data: "...", mimeType: "image/png" },
        { type: "resource", resource: { uri: "u", text: "second" } },
        { type: "resource", resource: { uri: "u", blob: "..." } },
        "not a block",
      ],
      isError: false,
    });
    expect(result.text()).toBe("first\nsecond");
  });

  test("json() parses the concatenated text", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: '{"results": [1, 2], "paging": null}' }],
      isError: false,
    });
    expect(result.json()).toEqual({ results: [1, 2], paging: null });
  });

  test("json() throws on non-JSON text", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: "3 results found" }],
      isError: false,
    });
    expect(() => result.json()).toThrow(SyntaxError);
  });

  test("json() prefers structuredContent when present", () => {
    const result = new ToolCallResult({
      content: [{ type: "text", text: "human summary" }],
      isError: false,
      structuredContent: { ok: true },
    });
    expect(result.json()).toEqual({ ok: true });
  });
});
