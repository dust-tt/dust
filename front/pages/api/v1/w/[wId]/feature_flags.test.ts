import { describe, expect, vi } from "vitest";

import handler from "@app/pages/api/v1/w/[wId]/feature_flags";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import {
  createPublicApiAuthenticationTests,
  createPublicApiMockRequest,
  createPublicApiSystemOnlyAuthenticationTests,
} from "@app/tests/utils/generic_public_api_tests";
import { itInTransaction } from "@app/tests/utils/utils";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";

// Mock the getSession function to return the user without going through the auth0 session
// Not sure to understand why it's not working with the generic_public_api_tests.ts mock
vi.mock(import("../../../../../lib/auth"), async (importOriginal) => {
  const mod = await importOriginal();
  return {
    ...mod,
    getSession: vi.fn().mockReturnValue(null),
  };
});

describe(
  "system only authentication tests",
  createPublicApiSystemOnlyAuthenticationTests(handler)
);

describe(
  "public api authentication tests",
  createPublicApiAuthenticationTests(handler)
);

describe("GET /api/v1/w/[wId]/feature_flags", () => {
  itInTransaction("returns 200 and an array of feature flags", async () => {
    const { req, res, workspace } = await createPublicApiMockRequest({
      systemKey: true,
    });

    // Add features flag
    await FeatureFlagFactory.basic("deepseek_feature", workspace);
    await FeatureFlagFactory.basic("labs_trackers", workspace);

    await handler(req, res);

    expect(res._getStatusCode()).toBe(200);
    expect(res._getJSONData()).toEqual(
      expect.objectContaining({
        feature_flags: ["deepseek_feature", "labs_trackers"],
      })
    );
  });

  itInTransaction("only GET, other methods returns 405", async () => {
    for (const method of ["PUT", "DELETE", "PATCH"] as const) {
      const { req, res } = await createPublicApiMockRequest({
        systemKey: true,
        method,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res._getJSONData()).toEqual({
        error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  });

  itInTransaction(
    "returns 200 and an empty array when no feature flags exist",
    async () => {
      const { req, res } = await createPublicApiMockRequest({
        systemKey: true,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual(
        expect.objectContaining({
          feature_flags: [],
        })
      );
    }
  );

  itInTransaction(
    "returns feature flags only for the requested workspace",
    async () => {
      // Create two workspaces with different feature flags
      const {
        req,
        res,
        workspace: workspace1,
      } = await createPublicApiMockRequest({ systemKey: true });

      const workspace2 = await WorkspaceFactory.basic();

      await FeatureFlagFactory.basic("labs_trackers", workspace1);
      await FeatureFlagFactory.basic("labs_transcripts", workspace2);

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      expect(res._getJSONData()).toEqual(
        expect.objectContaining({
          feature_flags: expect.arrayContaining(["labs_trackers"]),
        })
      );
      expect(res._getJSONData().feature_flags).not.toContain(
        "labs_transcripts"
      );
    }
  );
});
