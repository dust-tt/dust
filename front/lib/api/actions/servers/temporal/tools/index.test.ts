import { Authenticator } from "@app/lib/auth";
import { getTemporalClientForFrontNamespace } from "@app/lib/temporal";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { MembershipFactory } from "@app/tests/utils/MembershipFactory";
import { UserFactory } from "@app/tests/utils/UserFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import type { Client } from "@temporalio/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TOOLS } from ".";

const MINIMAL_PARAMS = {
  namespace: "front",
  workflow_id: "wf-1",
  task_queue: "queue-1",
} as const;

function createTestExtra(auth: Authenticator) {
  return {
    signal: new AbortController().signal,
    auth,
    runContext: undefined,
  } as unknown as Parameters<(typeof TOOLS)[number]["handler"]>[1];
}

async function makeAuth({
  superUser,
  dustWorkspace,
  flagEnabled,
}: {
  superUser: boolean;
  dustWorkspace: boolean;
  flagEnabled: boolean;
}) {
  const workspace = await WorkspaceFactory.basic();
  const user = superUser
    ? await UserFactory.superUser()
    : await UserFactory.basic();
  await MembershipFactory.associate(workspace, user, { role: "admin" });
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  if (dustWorkspace) {
    vi.stubEnv("PRODUCTION_DUST_WORKSPACE_ID", workspace.sId);
  }
  if (flagEnabled) {
    await FeatureFlagFactory.basic(auth, "temporal_mcp");
  }
  return auth;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("temporal tools - security gates", () => {
  const deniedCases = [
    {
      name: "non super user",
      setup: { superUser: false, dustWorkspace: true, flagEnabled: true },
      expectedMessage: "super user privileges",
    },
    {
      name: "super user outside the Dust workspace",
      setup: { superUser: true, dustWorkspace: false, flagEnabled: true },
      expectedMessage: "Dust-internal workspace",
    },
    {
      name: "super user without the temporal_mcp flag",
      setup: { superUser: true, dustWorkspace: true, flagEnabled: false },
      expectedMessage: "temporal_mcp feature flag",
    },
  ];

  for (const { name, setup, expectedMessage } of deniedCases) {
    it(`denies every tool to a ${name} without reaching Temporal`, async () => {
      const auth = await makeAuth(setup);
      vi.mocked(getTemporalClientForFrontNamespace).mockClear();

      for (const tool of TOOLS) {
        // Every tool accepts a subset of MINIMAL_PARAMS; extra keys are ignored by handlers.
        const result = await tool.handler(
          MINIMAL_PARAMS as never,
          createTestExtra(auth)
        );
        expect(result.isErr(), tool.name).toBe(true);
        if (result.isErr()) {
          expect(result.error.message).toContain(expectedMessage);
        }
      }

      expect(getTemporalClientForFrontNamespace).not.toHaveBeenCalled();
    });
  }

  it("lists workflows when all gates pass", async () => {
    const auth = await makeAuth({
      superUser: true,
      dustWorkspace: true,
      flagEnabled: true,
    });

    const startTime = new Date("2026-10-17T10:00:00Z");
    const fakeClient = {
      options: { namespace: "dust-front.test" },
      workflow: {
        list: async function* () {
          for (const workflowId of ["wf-1", "wf-2", "wf-3"]) {
            yield {
              workflowId,
              runId: `run-${workflowId}`,
              type: "upsertDocumentWorkflow",
              status: { name: "FAILED" },
              taskQueue: "upsert-queue-v2",
              startTime,
              closeTime: new Date(startTime.getTime() + 1500),
              historyLength: 12,
              typedSearchAttributes: { getAll: () => [] },
            };
          }
        },
      },
    };
    vi.mocked(getTemporalClientForFrontNamespace).mockResolvedValueOnce(
      fakeClient as unknown as Client
    );

    const tool = TOOLS.find((t) => t.name === "list_workflows");
    expect(tool).toBeDefined();
    const result = await tool!.handler(
      { namespace: "front", limit: 2 } as never,
      createTestExtra(auth)
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const content = result.value[0];
      expect(content.type).toBe("text");
      if (content.type === "text") {
        const parsed = JSON.parse(content.text);
        expect(parsed.returned).toBe(2);
        expect(parsed.mayHaveMore).toBe(true);
        expect(parsed.countsByTypeAndStatus).toEqual({
          upsertDocumentWorkflow: { FAILED: 2 },
        });
        expect(parsed.workflows[0].durationMs).toBe(1500);
        expect(parsed.workflows[0].temporalUiUrl).toBe(
          "https://cloud.temporal.io/namespaces/dust-front.test/workflows/wf-1/run-wf-1/history"
        );
      }
    }
  });
});
