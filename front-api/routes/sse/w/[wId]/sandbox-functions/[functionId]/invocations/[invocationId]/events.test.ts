import { SandboxFunctionInvocationResource } from "@app/lib/resources/sandbox_function_invocation_resource";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createPrivateApiMockRequest } from "@app/tests/utils/generic_private_api_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import { honoApp } from "@front-api/app";
import {
  asyncIteratorFrom,
  parseSseDataPayloads,
} from "@front-api/tests/utils/sse";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox/functions/events", async (importOriginal) => {
  const mod =
    await importOriginal<
      typeof import("@app/lib/api/sandbox/functions/events")
    >();
  return {
    ...mod,
    getSandboxFunctionInvocationEvents: vi.fn(),
  };
});

import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox/functions/events";

const inputSchema: JSONSchema = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
};

const outputSchema: JSONSchema = {
  type: "object",
  properties: {
    ok: { type: "boolean" },
  },
};

async function setupSandboxFunctionInvocation({
  withSandboxFunctionsFeatureFlag = true,
}: {
  withSandboxFunctionsFeatureFlag?: boolean;
} = {}) {
  const { workspace, auth } = await createPrivateApiMockRequest({
    role: "admin",
  });
  if (withSandboxFunctionsFeatureFlag) {
    await FeatureFlagFactory.basic(auth, "sandbox_functions");
  }

  const space = await SpaceFactory.project(workspace);
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "function.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  const sandboxFunction = await SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    slug: "run-function",
    description: "Run the function.",
    inputSchema,
    outputSchema,
  });
  const invocation = await SandboxFunctionInvocationResource.makeNew(auth, {
    sandboxFunction,
  });

  return { workspace, sandboxFunction, invocation };
}

function getEvents({
  workspaceId,
  functionId,
  invocationId,
}: {
  workspaceId: string;
  functionId: string;
  invocationId: string;
}) {
  return honoApp.request(
    `/api/sse/w/${workspaceId}/sandbox-functions/${functionId}/invocations/${invocationId}/events`
  );
}

describe("GET /api/sse/w/[wId]/sandbox-functions/[functionId]/invocations/[invocationId]/events", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("streams sandbox function invocation events to the client", async () => {
    const { workspace, sandboxFunction, invocation } =
      await setupSandboxFunctionInvocation();
    const resultEvent: {
      eventId: string;
      data: SandboxFunctionInvocationEvent;
    } = {
      eventId: "result",
      data: {
        type: "sandbox_function_invocation_result",
        created: Date.now(),
        invocationId: invocation.sId,
        functionId: sandboxFunction.sId,
        result: { hello: "world" },
      },
    };
    vi.mocked(getSandboxFunctionInvocationEvents).mockImplementation(
      asyncIteratorFrom([resultEvent])
    );

    const response = await getEvents({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(200);
    const payloads = parseSseDataPayloads(await response.text());
    expect(payloads.map((p) => JSON.parse(p).data.result)).toEqual([
      { hello: "world" },
    ]);
    expect(getSandboxFunctionInvocationEvents).toHaveBeenCalledWith({
      invocationId: invocation.sId,
      lastEventId: null,
      signal: expect.any(AbortSignal),
    });
  });

  it("returns 404 when the invocation does not exist", async () => {
    const { workspace, sandboxFunction } =
      await setupSandboxFunctionInvocation();

    const response = await getEvents({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
      invocationId: "sfi_unknown",
    });

    expect(response.status).toBe(404);
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("requires sandbox functions to be enabled", async () => {
    const { workspace, sandboxFunction, invocation } =
      await setupSandboxFunctionInvocation({
        withSandboxFunctionsFeatureFlag: false,
      });

    const response = await getEvents({
      workspaceId: workspace.sId,
      functionId: sandboxFunction.sId,
      invocationId: invocation.sId,
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: {
        type: "feature_flag_not_found",
        message: "Sandbox Functions are not enabled for this workspace.",
      },
    });
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });
});
