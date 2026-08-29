import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { frameV2ContentType } from "@app/types/files";
import { Ok } from "@app/types/shared/result";
import { honoApp } from "@front-api/app";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return {
    ...mod,
    publishSandboxFunctionInvocationEvent: vi.fn(),
    getSandboxFunctionInvocationEvents: vi.fn(async function* () {}),
  };
});

vi.mock("@app/temporal/sandbox_functions/client", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/temporal/sandbox_functions/client")
    >();
  return {
    ...mod,
    launchSandboxFunctionInvocationWorkflow: vi.fn(
      async () => new Ok(undefined)
    ),
  };
});

import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";

const inputSchema: JSONSchema = { type: "object" };
const outputSchema: JSONSchema = { type: "object" };

async function setupFrameFunction({
  enableFramesV2 = true,
  shareScope = "workspace_and_emails",
}: {
  enableFramesV2?: boolean;
  shareScope?: "emails_only" | "workspace_and_emails";
} = {}) {
  const { workspace, auth: adminAuth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (enableFramesV2) {
    await FeatureFlagFactory.basic(adminAuth, "frames_v2");
  }
  const space = await SpaceFactory.project(workspace);
  const publicationId = "publication-1";
  const frame = await FileFactory.create(adminAuth, null, {
    contentType: frameV2ContentType,
    fileName: "manifest.json",
    fileSize: 100,
    status: "ready",
    useCase: "project_context",
    useCaseMetadata: {
      spaceId: space.sId,
      activePublicationId: publicationId,
    },
  });
  await frame.setShareScope(adminAuth, shareScope);
  await withTransaction((transaction) =>
    SandboxFunctionResource.createForFramePublication(
      adminAuth,
      {
        frame,
        publicationId,
        functions: [
          {
            name: "run-function",
            description: "Run the Frame function.",
            userIdentity: "optional",
            executionMode: "durable",
            defaultStake: "low",
            bundleCode:
              "export default { fetch: async () => Response.json({}) };",
            inputSchema,
            outputSchema,
          },
        ],
      },
      transaction
    )
  );
  const sandboxFunction =
    await SandboxFunctionResource.fetchByFramePublicationAndSlug(adminAuth, {
      frame,
      publicationId,
      slug: "run-function",
    });
  if (!sandboxFunction) {
    throw new Error("Expected the Frame function to exist.");
  }

  await createPrivateApiMockRequest({
    role: "user",
    workspace,
  });

  return {
    adminAuth,
    frame,
    sandboxFunction,
    workspace,
  };
}

function postInvocation({
  workspaceId,
  frameId,
  functionName = "run-function",
}: {
  workspaceId: string;
  frameId: string;
  functionName?: string;
}) {
  return honoApp.request(
    `/api/w/${workspaceId}/frames/${frameId}/functions/${functionName}/invocations`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: { message: "hello" } }),
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/w/:wId/frames/:frameId/functions/:name/invocations", () => {
  it("invokes the named function from the active publication", async () => {
    const { workspace, frame, sandboxFunction } = await setupFrameFunction();

    const response = await postInvocation({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      invocation: {
        functionId: sandboxFunction.sId,
        status: "created",
      },
    });
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sandboxFunction: expect.objectContaining({
          sId: sandboxFunction.sId,
          publicationId: "publication-1",
        }),
      })
    );
  });

  it("does not resolve a function outside the active publication", async () => {
    const { workspace, frame } = await setupFrameFunction();
    await frame.setActiveFramePublication("publication-2");

    const response = await postInvocation({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    });

    expect(response.status).toBe(404);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("enforces Frame use rights", async () => {
    const { workspace, frame } = await setupFrameFunction({
      shareScope: "emails_only",
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    });

    expect(response.status).toBe(404);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("is available only behind frames_v2", async () => {
    const { workspace, frame } = await setupFrameFunction({
      enableFramesV2: false,
    });

    const response = await postInvocation({
      workspaceId: workspace.sId,
      frameId: frame.sId,
    });

    expect(response.status).toBe(403);
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });
});
