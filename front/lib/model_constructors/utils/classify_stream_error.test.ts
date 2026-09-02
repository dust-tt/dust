import type { EndpointMetadata } from "@app/lib/model_constructors/types/endpoint_metadata";
import { classifyStreamError } from "@app/lib/model_constructors/utils/classify_stream_error";
import { describe, expect, it } from "vitest";

const metadata: EndpointMetadata = {
  lab: "z_ai",
  host: "fireworks",
  region: "global",
  model: "glm-5p2",
};

describe("classifyStreamError", () => {
  it.each([
    ["terminated", "UND_ERR_SOCKET"],
    ["socket hang up", "ECONNRESET"],
    ["connection refused", "ECONNREFUSED"],
    ["broken pipe", "EPIPE"],
    ["network is unreachable", "ENETUNREACH"],
    ["no route to host", "EHOSTUNREACH"],
    ["software caused connection abort", "ECONNABORTED"],
  ] as const)("classifies %s with cause code %s as a network error", (message, code) => {
    // Network codes on the cause win over a stream-close code on the wrapper.
    const error = Object.assign(
      new TypeError(message, {
        cause: Object.assign(new Error("socket failure"), { code }),
      }),
      { code: "ERR_STREAM_PREMATURE_CLOSE" }
    );

    expect(
      classifyStreamError({
        error,
        metadata,
        providerName: "Fireworks",
      }).content
    ).toMatchObject({
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
        metadata,
        providerName: "OpenAI",
      }).content
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
        metadata,
        providerName: "Anthropic",
      }).content
    ).toMatchObject({
      errorSource: "unknown",
      type: "stream_error",
    });
  });

  it.each([
    "connection",
    "timeout",
  ] as const)("classifies an SDK %s error from the adapter instanceof hint", (sdkClass) => {
    expect(
      classifyStreamError({
        error: new Error("sdk failure"),
        metadata,
        providerName: "OpenAI",
        sdkClass,
      }).content
    ).toMatchObject({
      errorSource: "unknown",
      type: sdkClass === "connection" ? "network_error" : "timeout_error",
    });
  });

  it.each([
    new TypeError("terminated"),
    new SyntaxError("unexpected token"),
  ])("does not classify on free-form message text or an arbitrary exception", (error) => {
    expect(
      classifyStreamError({
        error,
        metadata,
        providerName: "Fireworks",
      }).content
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });

  it.each([
    new DOMException("The operation was aborted.", "AbortError"),
    Object.assign(new Error("The operation was aborted"), {
      code: "UND_ERR_ABORTED",
    }),
  ])("does not attribute an abort to the provider", (error) => {
    expect(
      classifyStreamError({
        error,
        metadata,
        providerName: "Mistral",
      }).content
    ).toMatchObject({
      errorSource: "unknown",
      type: "unknown_error",
    });
  });
});
