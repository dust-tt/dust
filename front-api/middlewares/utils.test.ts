import { unhandledErrorHandler } from "@front-api/middlewares/utils";
import { Hono } from "hono";
import { validator } from "hono/validator";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loggerError: vi.fn(),
  loggerInfo: vi.fn(),
  statsdIncrement: vi.fn(),
}));

vi.mock("@app/lib/utils/statsd", () => ({
  getStatsDClient: () => ({ increment: mocks.statsdIncrement }),
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    error: mocks.loggerError,
    info: mocks.loggerInfo,
  },
}));

vi.mock("@app/logger/tracer", () => ({
  default: { scope: () => ({ active: () => null }) },
}));

vi.mock("@app/logger/withlogging", () => ({
  getSequelizeErrorDetails: () => null,
}));

function createApp() {
  const app = new Hono();
  app.post(
    "/",
    validator("json", (value) => value),
    (ctx) => ctx.json({ success: true })
  );
  app.onError(unhandledErrorHandler);
  return app;
}

function getClientErrorLog() {
  const call = mocks.loggerInfo.mock.calls.find(
    ([, message]) => message === "Client API Error"
  );
  expect(call).toBeDefined();
  return call?.[0];
}

describe("unhandledErrorHandler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs body sizes and the parse error without logging malformed JSON contents", async () => {
    const body = '{"private":do-not-log-this}';
    const bodySizeBytes = Buffer.byteLength(body, "utf8");

    const response = await createApp().request("/", {
      method: "POST",
      headers: {
        "content-length": String(bodySizeBytes),
        "content-type": "application/json",
      },
      body,
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: {
        type: "invalid_request_error",
        message: "Malformed JSON in request body",
      },
    });
    expect(getClientErrorLog()).toMatchObject({
      malformedJson: {
        declaredContentLengthBytes: bodySizeBytes,
        failureStage: "json_parse",
        matchesDeclaredContentLength: true,
        receivedBodySizeBytes: bodySizeBytes,
        transferEncoding: null,
      },
    });
    expect(JSON.stringify(getClientErrorLog())).not.toContain(
      "do-not-log-this"
    );
  });

  it("logs the body read failure when the request stream is interrupted", async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"partial":'));
        controller.error(new Error("socket closed during upload"));
      },
    });
    const requestInit: RequestInit & { duplex: "half" } = {
      body,
      duplex: "half",
      headers: {
        "content-length": "100",
        "content-type": "application/json",
      },
      method: "POST",
    };
    const request = new Request("http://localhost/", requestInit);

    const response = await createApp().request(request);

    expect(response.status).toBe(400);
    expect(getClientErrorLog()).toMatchObject({
      malformedJson: {
        bodyReadError: {
          name: "Error",
          message: "socket closed during upload",
        },
        declaredContentLengthBytes: 100,
        failureStage: "body_read",
        transferEncoding: null,
      },
    });
  });
});
