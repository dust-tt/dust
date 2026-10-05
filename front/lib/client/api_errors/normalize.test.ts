import { toDisplayableAPIError } from "@app/lib/client/api_errors/normalize";
import { describe, expect, it } from "vitest";

describe("toDisplayableAPIError", () => {
  it("reads an API error response thrown by the fetcher", () => {
    expect(
      toDisplayableAPIError({
        error: {
          type: "invalid_request_error",
          message: "Column foo is missing",
        },
      })
    ).toEqual({
      type: "invalid_request_error",
      rawMessage: "Column foo is missing",
    });
  });

  it("reads a bare API error without a message", () => {
    expect(toDisplayableAPIError({ type: "user_not_found" })).toEqual({
      type: "user_not_found",
      rawMessage: null,
    });
  });

  it("prefers the connectors error message", () => {
    expect(
      toDisplayableAPIError({
        error: {
          type: "connector_update_error",
          message: "Connector update failed",
          connectors_error: {
            type: "connector_rate_limit_error",
            message: "Rate limited by Slack",
          },
        },
      })
    ).toEqual({
      type: "connector_update_error",
      rawMessage: "Rate limited by Slack",
    });
  });

  it("keeps the message of an error type the client doesn't know", () => {
    expect(
      toDisplayableAPIError({
        error: { type: "brand_new_error", message: "Something new" },
      })
    ).toEqual({ type: null, rawMessage: "Something new" });
  });

  it("reads errors and strings", () => {
    expect(toDisplayableAPIError(new Error("Network down"))).toEqual({
      type: null,
      rawMessage: "Network down",
    });
    expect(toDisplayableAPIError("Boom")).toEqual({
      type: null,
      rawMessage: "Boom",
    });
  });

  it("ignores empty messages and unknown values", () => {
    expect(
      toDisplayableAPIError({ error: { type: "user_not_found", message: " " } })
    ).toEqual({ type: "user_not_found", rawMessage: null });
    expect(toDisplayableAPIError(undefined)).toEqual({
      type: null,
      rawMessage: null,
    });
    expect(toDisplayableAPIError([1, 2])).toEqual({
      type: null,
      rawMessage: null,
    });
  });
});
