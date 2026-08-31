import { classifyStreamError } from "@app/lib/model_constructors/utils/classify_stream_error";
import { describe, expect, it } from "vitest";

describe("classifyStreamError", () => {
  it.each([
    ["terminated", "UND_ERR_SOCKET"],
    ["socket hang up", "ECONNRESET"],
    ["connection refused", "ECONNREFUSED"],
  ] as const)("classifies %s with cause code %s as a network error", (message, code) => {
    const error = Object.assign(
      new TypeError(message, {
        cause: Object.assign(new Error("socket failure"), { code }),
      }),
      { code: "ERR_STREAM_PREMATURE_CLOSE" }
    );

    expect(
      classifyStreamError({
        error,
        providerName: "Fireworks",
      })
    ).toEqual({
      errorSource: "unknown",
      type: "network_error",
      message: `Network error connecting to Fireworks: ${message} (${code})`,
    });
  });

  it("classifies a response timeout by undici code without blaming the provider", () => {
    expect(
      classifyStreamError({
        error: Object.assign(new Error("other side closed"), {
          code: "UND_ERR_BODY_TIMEOUT",
        }),
        providerName: "OpenAI",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "timeout_error",
    });
  });

  it("classifies a premature stream close by Node code without blaming the provider", () => {
    expect(
      classifyStreamError({
        error: Object.assign(new Error("Premature close"), {
          code: "ERR_STREAM_PREMATURE_CLOSE",
        }),
        providerName: "Anthropic",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "stream_error",
    });
  });

  it("classifies an SDK connection error from the adapter instanceof hint", () => {
    expect(
      classifyStreamError({
        error: new Error("connection reset"),
        providerName: "OpenAI",
        sdkClass: "connection",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "network_error",
    });
  });

  it("does not classify on free-form message text", () => {
    expect(
      classifyStreamError({
        error: new TypeError("terminated"),
        providerName: "Fireworks",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });

  it("does not attribute an arbitrary exception to the provider", () => {
    expect(
      classifyStreamError({
        error: new SyntaxError("unexpected token"),
        providerName: "Google",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });

  it("does not attribute an abort to the provider", () => {
    expect(
      classifyStreamError({
        error: new DOMException("The operation was aborted.", "AbortError"),
        providerName: "Mistral",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });

  it("does not attribute the undici abort code UND_ERR_ABORTED to the provider", () => {
    expect(
      classifyStreamError({
        error: Object.assign(new Error("The operation was aborted"), {
          code: "UND_ERR_ABORTED",
        }),
        providerName: "Anthropic",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });

  it.each([
    ["EPIPE", "broken pipe"],
    ["ENETUNREACH", "network is unreachable"],
    ["EHOSTUNREACH", "no route to host"],
    ["ECONNABORTED", "software caused connection abort"],
  ] as const)("classifies %s as a retryable network error", (code, message) => {
    expect(
      classifyStreamError({
        error: Object.assign(new Error(message), { code }),
        providerName: "Fireworks",
      })
    ).toMatchObject({
      errorSource: "unknown",
      type: "network_error",
    });
  });
});
