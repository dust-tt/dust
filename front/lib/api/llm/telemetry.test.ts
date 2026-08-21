import {
  PROVIDER_OUTAGE_ERROR_TYPES,
  resolveErrorSource,
} from "@app/lib/api/llm/telemetry";
import { describe, expect, it } from "vitest";

describe("resolveErrorSource", () => {
  it("preserves an explicit source even when the type is an outage type", () => {
    expect(
      resolveErrorSource({
        errorSource: "unknown",
        errorType: "stream_error",
      })
    ).toBe("unknown");
    expect(
      resolveErrorSource({
        errorSource: "dust",
        errorType: "timeout_error",
      })
    ).toBe("dust");
  });

  it("falls back to provider for outage types when the source was not preserved", () => {
    for (const errorType of PROVIDER_OUTAGE_ERROR_TYPES) {
      expect(resolveErrorSource({ errorType })).toBe("provider");
    }
  });

  it("falls back to unknown when the type is not a known provider outage", () => {
    expect(resolveErrorSource({ errorType: "invalid_request_error" })).toBe(
      "unknown"
    );
    expect(resolveErrorSource({ errorType: "llm_timeout_error" })).toBe(
      "unknown"
    );
  });
});
