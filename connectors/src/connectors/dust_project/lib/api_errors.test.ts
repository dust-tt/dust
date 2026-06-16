import logger from "@connectors/logger/logger";
import type { APIError } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import { describe, expect, it } from "vitest";

import {
  isWorkspaceCanUseProductRequiredError,
  parseDustApiResult,
} from "./api_errors";

describe("isWorkspaceCanUseProductRequiredError", () => {
  it("returns true for workspace_can_use_product_required_error", () => {
    const error: APIError = {
      type: "workspace_can_use_product_required_error",
      message: "Your current plan does not allow API access.",
    };
    expect(isWorkspaceCanUseProductRequiredError(error)).toBe(true);
  });

  it("returns false for other API errors", () => {
    const error: APIError = {
      type: "workspace_not_found",
      message: "The workspace was not found.",
    };
    expect(isWorkspaceCanUseProductRequiredError(error)).toBe(false);
  });
});

describe("parseDustApiResult", () => {
  it("returns the value on success", () => {
    const parsed = parseDustApiResult({
      result: new Ok({ conversations: [] }),
      logger: logger.child({ test: true }),
      projectId: "project-1",
      workspaceId: "workspace-1",
      errorPrefix: "Failed to fetch conversations",
    });

    expect(parsed.skipped).toBe(false);
    if (!parsed.skipped) {
      expect(parsed.value).toEqual({ conversations: [] });
    }
  });

  it("returns a skip marker for workspace_can_use_product_required_error", () => {
    const parsed = parseDustApiResult({
      result: new Err({
        type: "workspace_can_use_product_required_error",
        message: "Your current plan does not allow API access.",
      }),
      logger: logger.child({ test: true }),
      projectId: "project-1",
      workspaceId: "workspace-1",
      errorPrefix: "Failed to fetch conversations",
    });

    expect(parsed.skipped).toBe(true);
    if (parsed.skipped) {
      expect(parsed.skipResult).toEqual({
        skippedDueToWorkspaceApiAccess: true,
      });
    }
  });

  it("throws for other API errors", () => {
    expect(() =>
      parseDustApiResult({
        result: new Err({
          type: "workspace_not_found",
          message: "The workspace was not found.",
        }),
        logger: logger.child({ test: true }),
        projectId: "project-1",
        workspaceId: "workspace-1",
        errorPrefix: "Failed to fetch conversations",
      })
    ).toThrow("Failed to fetch conversations: The workspace was not found.");
  });
});
