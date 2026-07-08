import { callSandboxFunction } from "@app/lib/api/sandbox_functions/call_sandbox_function";
import type { SandboxFunctionInvocationStreamEvent } from "@app/lib/api/sandbox_functions/events";
import type { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileFactory } from "@app/tests/utils/FileFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import type { SandboxFunctionInvocationEvent } from "@app/types/api/sandbox_functions";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@app/lib/api/sandbox_functions/events", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/events")
    >();
  return { ...actual, getSandboxFunctionInvocationEvents: vi.fn() };
});

import { getSandboxFunctionInvocationEvents } from "@app/lib/api/sandbox_functions/events";

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
  space: SpaceResource
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
  vi.spyOn(fn, "invoke").mockResolvedValue(
    new Ok({
      sId: invocationId,
      functionId: fn.sId,
      status: "created",
      createdAt: new Date(0).toISOString(),
    })
  );
  return { auth: authenticator, fn, invocationId };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("callSandboxFunction", () => {
  it("returns the decoded body on a successful result", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult(
      {
        ok: true,
        response: {
          status: 200,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ greeting: "Hi, Soupinou" }),
          encoding: "utf8",
        },
      },
      invocationId
    );

    const result = await callSandboxFunction(auth, fn, { name: "Soupinou" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({
      ok: true,
      status: 200,
      output: JSON.stringify({ greeting: "Hi, Soupinou" }),
    });
  });

  it("decodes a base64-encoded body", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult(
      {
        ok: true,
        response: {
          status: 200,
          headers: {},
          body: Buffer.from("plain text", "utf8").toString("base64"),
          encoding: "base64",
        },
      },
      invocationId
    );

    const result = await callSandboxFunction(auth, fn, undefined);

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({
      ok: true,
      status: 200,
      output: "plain text",
    });
  });

  it("surfaces a function error envelope as ok: false", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult(
      { ok: false, error: { kind: "threw", message: "boom" } },
      invocationId
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({
      ok: false,
      errorKind: "threw",
      message: "boom",
    });
  });

  it("errors on an unexpected result envelope", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult({ not: "an envelope" }, invocationId);

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
  });

  it("errors when no result event arrives", async () => {
    const { auth, fn } = await setup();
    vi.mocked(getSandboxFunctionInvocationEvents).mockReturnValue(
      eventStream()
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
  });

  it("returns a non-2xx response as ok with its status", async () => {
    const { auth, fn, invocationId } = await setup();
    mockResult(
      {
        ok: true,
        response: {
          status: 400,
          headers: {},
          body: JSON.stringify({ error: "invalid input" }),
          encoding: "utf8",
        },
      },
      invocationId
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({
      ok: true,
      status: 400,
      output: JSON.stringify({ error: "invalid input" }),
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
          result: {
            ok: true,
            response: {
              status: 200,
              headers: {},
              body: JSON.stringify({ greeting: "Hi" }),
              encoding: "utf8",
            },
          },
        }
      )
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value).toEqual({
      ok: true,
      status: 200,
      output: JSON.stringify({ greeting: "Hi" }),
    });
  });

  it("propagates an Err from invoke()", async () => {
    const { auth, fn } = await setup();
    vi.spyOn(fn, "invoke").mockResolvedValue(
      new Err(new Error("sandbox unavailable"))
    );

    const result = await callSandboxFunction(auth, fn, { name: "x" });

    expect(result.isErr()).toBe(true);
  });
});
