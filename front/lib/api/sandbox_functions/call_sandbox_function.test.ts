import { callSandboxFunction } from "@app/lib/api/sandbox_functions/call_sandbox_function";
import type { SandboxFunctionInvocationStreamEvent } from "@app/lib/api/sandbox_functions/events";
import { SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS } from "@app/lib/api/sandbox_functions/result_envelope";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type {
  SandboxFunctionInvocationEvent,
  SandboxFunctionUserIdentityPolicy,
} from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return { ...actual, getSandboxFunctionInvocationEvents: vi.fn() };
});

vi.mock("@app/temporal/sandbox_functions/client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/temporal/sandbox_functions/client")
    >();
  return {
    ...actual,
    launchSandboxFunctionInvocationWorkflow: vi.fn(
      async () => new Ok(undefined)
    ),
  };
});

import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";
import { launchSandboxFunctionInvocationWorkflow } from "@app/temporal/sandbox_functions/client";

const inputSchema: JSONSchema = {
  type: "object",
  properties: { name: { type: "string" } },
  required: ["name"],
};
const outputSchema: JSONSchema = {
  type: "object",
  properties: { greeting: { type: "string" } },
  required: ["greeting"],
};

function eventStream(
  ...events: SandboxFunctionInvocationEvent[]
): AsyncGenerator<SandboxFunctionInvocationStreamEvent, void> {
  async function* gen() {
    for (const [index, data] of events.entries()) {
      yield { eventId: `${index}`, data };
    }
  }
  return gen();
}

function mockResult(result: unknown, invocationId: string): void {
  vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
    eventStream({
      type: "sandbox_function_invocation_result",
      created: 0,
      invocationId,
      functionId: "sfn_x",
      result,
    })
  );
}

async function makeFunction(
  auth: Authenticator,
  space: SpaceResource,
  userIdentity: SandboxFunctionUserIdentityPolicy = "optional"
): Promise<SandboxFunctionResource> {
  const file = await FileFactory.create(auth, null, {
    contentType: sandboxFunctionContentType,
    fileName: "greet.ts",
    fileSize: 100,
    status: "created",
    useCase: "project_context",
    useCaseMetadata: { spaceId: space.sId },
  });
  return SandboxFunctionResource.makeNew(auth, {
    space,
    file,
    slug: "greet",
    description: "Greet a user by name.",
    userIdentity,
    inputSchema,
    outputSchema,
  });
}

async function setup(): Promise<{
  auth: Authenticator;
  fn: SandboxFunctionResource;
  invocationId: string;
}> {
  const { authenticator, workspace } = await createResourceTest({
    role: "admin",
  });
  const space = await SpaceFactory.project(workspace);
  const fn = await makeFunction(authenticator, space);
  const invocationId = "sfi_test";
  return { auth: authenticator, fn, invocationId };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("callSandboxFunction", () => {
  it("returns the parsed output on a successful result", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult({ greeting: "Hi, Soupinou" }, invocationId);
    const invokeSpy = vi.spyOn(fn, "invoke");

    const result = await callSandboxFunction(
      auth,
      fn,
      { name: "Soupinou" },
      { timezone: "Europe/Paris" }
    );

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({ greeting: "Hi, Soupinou" });
    expect(invokeSpy).toHaveBeenCalledWith(auth, {
      input: { name: "Soupinou" },
      context: { timezone: "Europe/Paris" },
    });
    expect(launchSandboxFunctionInvocationWorkflow).toHaveBeenCalledWith(
      auth,
      expect.objectContaining({
        invocation: expect.objectContaining({ origin: "delegated" }),
      })
    );
  });

  it("returns a typed invocation error", async () => {
    const { auth, fn, invocationId } = await setup();
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream({
        type: "sandbox_function_invocation_error",
        created: 0,
        invocationId,
        functionId: "sfn_x",
        error: { code: "http_error", message: "boom", status: 503 },
      })
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "http_error",
      message: "boom",
      status: 503,
    });
  });

  it("bounds a stream-delivered error message to the delivery cap", async () => {
    const { auth, fn, invocationId } = await setup();
    const longMessage = "x".repeat(
      SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS * 20
    );
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream({
        type: "sandbox_function_invocation_error",
        created: 0,
        invocationId,
        functionId: "sfn_x",
        error: { code: "invocation_failed", message: longMessage },
      })
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("invocation_failed");
    expect(result.error.message).toHaveLength(
      SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS
    );
    expect(result.error.message.endsWith("...")).toBe(true);
  });

  it("bounds the message of an invoke that fails before executing", async () => {
    const { auth, fn } = await setup();
    const longMessage = "y".repeat(
      SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS * 20
    );
    vi.spyOn(fn, "invoke").mockResolvedValue(new Err(new Error(longMessage)));

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("invocation_failed");
    expect(result.error.message).toHaveLength(
      SANDBOX_FUNCTION_DELIVERED_ERROR_MESSAGE_MAX_CHARS
    );
  });

  it("fails closed on a policy introduced by a newer application version", async () => {
    const { auth, fn } = await setup();
    Object.assign(fn, { userIdentity: "future_policy" });

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("user_authentication_required");
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("rejects an authenticator from another workspace", async () => {
    const { fn } = await setup();
    const { authenticator: otherWorkspaceAuth } = await createResourceTest({
      role: "admin",
    });

    const result = await fn.invoke(otherWorkspaceAuth, {
      input: { name: "Soupinou" },
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toBe(
      "This Pod Function belongs to another workspace."
    );
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("rejects a workspace-user-required function without creating an invocation", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(
      authenticator,
      space,
      "workspace_user_required"
    );
    const userlessAuth = await Authenticator.internalAdminForWorkspace(
      workspace.sId
    );

    const result = await callSandboxFunction(userlessAuth, fn, {
      name: "Soupinou",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "user_authentication_required",
      message:
        "This Pod Function requires a logged-in user from its workspace.",
    });
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("rejects delegated calls to an interactive-session-required function", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(
      authenticator,
      space,
      "interactive_workspace_user_required"
    );
    vi.spyOn(authenticator, "authMethod").mockReturnValue("session");

    const result = await callSandboxFunction(authenticator, fn, {
      name: "Soupinou",
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "user_authentication_required",
      message:
        "This Pod Function requires a logged-in workspace member in a live Dust session.",
    });
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
    expect(getSandboxFunctionInvocationEvents).not.toHaveBeenCalled();
  });

  it("rejects a non-session authenticator even with an interactive origin", async () => {
    const { authenticator, workspace } = await createResourceTest({
      role: "admin",
    });
    const space = await SpaceFactory.project(workspace);
    const fn = await makeFunction(
      authenticator,
      space,
      "interactive_workspace_user_required"
    );

    const result = await fn.invoke(
      authenticator,
      { input: { name: "Soupinou" } },
      { origin: "interactive_session" }
    );

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.message).toContain("live Dust session");
    expect(launchSandboxFunctionInvocationWorkflow).not.toHaveBeenCalled();
  });

  it("errors when no result event arrives", async () => {
    const { auth, fn } = await setup();
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream()
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "transport_error",
      message: "Pod function did not return a result in time.",
    });
  });

  it("returns a transport error when the event stream fails", async () => {
    const { auth, fn } = await setup();
    async function* failingEventStream() {
      throw new Error("stream disconnected");
    }
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      failingEventStream()
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "transport_error",
      message: "Failed to receive sandbox function events: stream disconnected",
    });
  });

  it("skips non-result events and returns the result", async () => {
    const { auth, fn, invocationId } = await setup();
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream(
        {
          type: "sandbox_function_invocation_created",
          created: 0,
          invocation: {
            sId: invocationId,
            functionId: "sfn_x",
            status: "created",
            createdAt: new Date(0).toISOString(),
          },
        },
        {
          type: "sandbox_function_invocation_result",
          created: 1,
          invocationId,
          functionId: "sfn_x",
          result: { greeting: "Hi" },
        }
      )
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({ greeting: "Hi" });
  });

  it("propagates an Err from the workflow launch", async () => {
    const { auth, fn } = await setup();
    vi.mocked(launchSandboxFunctionInvocationWorkflow).mockResolvedValueOnce(
      new Err(new Error("temporal unavailable"))
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error).toEqual({
      code: "invocation_failed",
      message: "temporal unavailable",
    });
  });
});
