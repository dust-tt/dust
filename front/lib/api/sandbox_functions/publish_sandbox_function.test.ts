import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import { reconcileDatabaseOnSandbox } from "@app/lib/api/sandbox_functions/dsbx_db";
import { SandboxFunctionError } from "@app/lib/api/sandbox_functions/errors";
import type { FunctionStateManifest } from "@app/lib/api/sandbox_functions/manifests";
import { publishSandboxFunction } from "@app/lib/api/sandbox_functions/publish_sandbox_function";
import { Authenticator } from "@app/lib/auth";
import { SandboxFunctionResource } from "@app/lib/resources/sandbox_function_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { FileModel } from "@app/lib/resources/storage/models/files";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { SpaceFactory } from "@app/tests/utils/SpaceFactory";
import { sandboxFunctionContentType } from "@app/types/files";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import assert from "assert";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock(
  "@app/lib/api/sandbox_functions/build_on_sandbox",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("@app/lib/api/sandbox_functions/build_on_sandbox")
      >();

    return { ...actual, buildSandboxFunctionOnSandbox: vi.fn() };
  }
);

vi.mock("@app/lib/api/sandbox_functions/dsbx_db", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@app/lib/api/sandbox_functions/dsbx_db")
    >();

  return { ...actual, reconcileDatabaseOnSandbox: vi.fn() };
});

// Mock the distributed lock to avoid a Redis dependency (established pattern, see
// lib/api/data_sources.test.ts / lib/resources/sandbox_resource.test.ts).
vi.mock("@app/lib/lock", () => ({
  executeWithLock: vi.fn(
    async (_lockName: string, fn: () => Promise<unknown>) => fn()
  ),
}));

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

function chatManifests(
  columns: Record<
    string,
    {
      type: string;
      mode: string | null;
      notNull: boolean;
      hasDefault: boolean;
      primaryKey: boolean;
      autoIncrement: boolean;
    }
  >
): FunctionStateManifest {
  return {
    version: 1,
    databases: {
      chat: {
        schemaFile: "databases/chat.db.ts",
        tables: { messages: { columns, indexes: {} } },
      },
    },
  };
}

const baseColumns = {
  id: {
    type: "integer",
    mode: null,
    notNull: true,
    hasDefault: true,
    primaryKey: true,
    autoIncrement: true,
  },
  body: {
    type: "text",
    mode: null,
    notNull: true,
    hasDefault: false,
    primaryKey: false,
    autoIncrement: false,
  },
};

// The publisher must be a pod member so DustFileSystem.forPod grants read access, matching the
// write gate the MCP tool enforces in production.
async function setupPod(): Promise<{
  workspace: LightWorkspaceType;
  space: SpaceResource;
  auth: Authenticator;
}> {
  const { workspace, user } = await createResourceTest({ role: "admin" });
  const space = await SpaceFactory.project(workspace, user.id);
  const auth = await Authenticator.fromUserIdAndWorkspaceId(
    user.sId,
    workspace.sId
  );
  assert(auth);

  return { workspace, space, auth };
}

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
  vi.mocked(reconcileDatabaseOnSandbox).mockResolvedValue(
    new Ok({ created: false, statements: [] })
  );
});

describe("publishSandboxFunction", () => {
  it("publishes a new function with one bundle file under the dedicated prefix", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "export default {};",
        inputSchema,
        outputSchema,
        manifests: null,
      })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    const fn = result.value.sandboxFunction;
    expect(fn.slug).toBe("greet");
    expect(fn.description).toBe("Greet someone.");
    expect(fn.inputSchema).toEqual(inputSchema);
    expect(fn.outputSchema).toEqual(outputSchema);
    expect(fn.manifests).toBeNull();
    expect(result.value.warnings).toEqual([]);
    expect(result.value.staleSiblings).toEqual([]);

    expect(buildSandboxFunctionOnSandbox).toHaveBeenCalledWith(auth, {
      space,
      srcSandboxPath: `/files/pod-${space.sId}/greet.ts`,
    });
    // No databases declared -> no reconcile.
    expect(reconcileDatabaseOnSandbox).not.toHaveBeenCalled();

    // The source stays on the mount, so the bundle is the only FileResource.
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(1);
    const bundle = files[0];
    expect(bundle.id).toBe(fn.fileId);
    expect(bundle.contentType).toBe(sandboxFunctionContentType);
    expect(bundle.useCase).toBe("project_context");
    expect(bundle.fileName).toBe("greet.ts");
    expect(bundle.useCaseMetadata?.spaceId).toBe(space.sId);
    expect(bundle.mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/greet.ts`
    );

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed.map(({ id }) => id)).toEqual([fn.id]);
  });

  it("overwrites the bundle in place on re-publish, keeping one row and the same file", async () => {
    const { workspace, space, auth } = await setupPod();

    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({ bundleCode: "v1", inputSchema, outputSchema, manifests: null })
    );
    const first = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v1",
      path: `pod-${space.sId}/greet.ts`,
    });
    expect(first.isOk()).toBe(true);
    if (first.isErr()) {
      return;
    }
    const firstFileId = first.value.sandboxFunction.fileId;
    const [firstBundle] = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    const firstVersion = firstBundle.version;

    const newOutputSchema: JSONSchema = {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    };
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "v2",
        inputSchema,
        outputSchema: newOutputSchema,
        manifests: null,
      })
    );
    const second = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "v2",
      path: `pod-${space.sId}/greet.ts`,
    });
    expect(second.isOk()).toBe(true);
    if (second.isErr()) {
      return;
    }

    expect(second.value.sandboxFunction.id).toBe(
      first.value.sandboxFunction.id
    );
    expect(second.value.sandboxFunction.description).toBe("v2");
    expect(second.value.sandboxFunction.outputSchema).toEqual(newOutputSchema);
    // The bundle file is reused in place, not replaced: same row, canonical mount path retained, and
    // its version bumped by the re-upload.
    expect(second.value.sandboxFunction.fileId).toBe(firstFileId);

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(1);
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files.map((file) => file.id)).toEqual([firstFileId]);
    expect(files[0].mountFilePath).toBe(
      `w/${workspace.sId}/pods/${space.sId}/sandbox-functions/greet.ts`
    );
    expect(files[0].version).toBeGreaterThan(firstVersion ?? 0);
  });

  it("rejects a path that escapes the pod mount", async () => {
    const { space, auth } = await setupPod();

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/../escape.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("invalid_path");
    expect(buildSandboxFunctionOnSandbox).not.toHaveBeenCalled();
  });

  it("surfaces a sandbox_unavailable build failure", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("sandbox_unavailable", "sandbox down"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("sandbox_unavailable");

    // No file is created when the build never succeeds.
    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(0);
  });

  it("passes a build failure through and creates no file", async () => {
    const { workspace, space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Err(new SandboxFunctionError("build_failed", "boom"))
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "greet",
      description: "Greet someone.",
      path: `pod-${space.sId}/greet.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("build_failed");

    const files = await FileModel.findAll({
      where: { workspaceId: workspace.id },
    });
    expect(files).toHaveLength(0);
    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(0);
  });

  it("stores manifests and reconciles each declared database", async () => {
    const { space, auth } = await setupPod();
    const manifests = chatManifests(baseColumns);
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({ bundleCode: "b", inputSchema, outputSchema, manifests })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "post-message",
      description: "Post a message.",
      path: `pod-${space.sId}/post-message.ts`,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.sandboxFunction.manifests).toEqual(manifests);

    expect(reconcileDatabaseOnSandbox).toHaveBeenCalledTimes(1);
    expect(reconcileDatabaseOnSandbox).toHaveBeenCalledWith(auth, {
      space,
      database: "chat",
      // The schema file resolves relative to the function source directory.
      schemaFileSandboxPath: `/files/pod-${space.sId}/databases/chat.db.ts`,
    });
  });

  it("blocks a publish that removes a column a sibling references, before any reconcile", async () => {
    const { space, auth } = await setupPod();

    // Publish the sibling first, with a manifest referencing chat.messages.body.
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "sib",
        inputSchema,
        outputSchema,
        manifests: chatManifests(baseColumns),
      })
    );
    const sibling = await publishSandboxFunction(auth, {
      space,
      slug: "list-messages",
      description: "List messages.",
      path: `pod-${space.sId}/list-messages.ts`,
    });
    expect(sibling.isOk()).toBe(true);
    vi.mocked(reconcileDatabaseOnSandbox).mockClear();

    // The new publish renames body -> content (drops body).
    const { body: _dropped, ...withoutBody } = baseColumns;
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "new",
        inputSchema,
        outputSchema,
        manifests: chatManifests({
          ...withoutBody,
          content: {
            type: "text",
            mode: null,
            notNull: false,
            hasDefault: false,
            primaryKey: false,
            autoIncrement: false,
          },
        }),
      })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "post-message",
      description: "Post a message.",
      path: `pod-${space.sId}/post-message.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("compat_blocked");
    expect(result.error.message).toContain("chat.messages.body");
    expect(result.error.message).toContain("list-messages");
    // Blocked before touching the live database, and nothing was stored.
    expect(reconcileDatabaseOnSandbox).not.toHaveBeenCalled();
    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed.map((fn) => fn.slug)).toEqual(["list-messages"]);
  });

  it("propagates a reconcile refusal and stores nothing", async () => {
    const { space, auth } = await setupPod();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "b",
        inputSchema,
        outputSchema,
        manifests: chatManifests(baseColumns),
      })
    );
    vi.mocked(reconcileDatabaseOnSandbox).mockResolvedValue(
      new Err(
        new SandboxFunctionError("reconcile_blocked", "destructive change")
      )
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "post-message",
      description: "Post a message.",
      path: `pod-${space.sId}/post-message.ts`,
    });

    expect(result.isErr()).toBe(true);
    if (result.isOk()) {
      return;
    }
    expect(result.error.code).toBe("reconcile_blocked");

    const listed = await SandboxFunctionResource.listBySpace(auth, space);
    expect(listed).toHaveLength(0);
  });

  it("returns mode-drift warnings and stale-sibling notes on a compatible publish", async () => {
    const { space, auth } = await setupPod();

    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "sib",
        inputSchema,
        outputSchema,
        manifests: chatManifests({
          ...baseColumns,
          created_at: {
            type: "integer",
            mode: "timestamp",
            notNull: true,
            hasDefault: false,
            primaryKey: false,
            autoIncrement: false,
          },
        }),
      })
    );
    const sibling = await publishSandboxFunction(auth, {
      space,
      slug: "list-messages",
      description: "List messages.",
      path: `pod-${space.sId}/list-messages.ts`,
    });
    expect(sibling.isOk()).toBe(true);

    // Same storage shape but created_at loses its mode and a column is added: compatible,
    // with a mode-drift warning and a stale-sibling note.
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: "new",
        inputSchema,
        outputSchema,
        manifests: chatManifests({
          ...baseColumns,
          created_at: {
            type: "integer",
            mode: null,
            notNull: true,
            hasDefault: false,
            primaryKey: false,
            autoIncrement: false,
          },
          topic: {
            type: "text",
            mode: null,
            notNull: false,
            hasDefault: false,
            primaryKey: false,
            autoIncrement: false,
          },
        }),
      })
    );

    const result = await publishSandboxFunction(auth, {
      space,
      slug: "report-activity",
      description: "Report activity.",
      path: `pod-${space.sId}/report-activity.ts`,
    });

    expect(result.isOk()).toBe(true);
    if (result.isErr()) {
      return;
    }
    expect(result.value.warnings).toHaveLength(1);
    expect(result.value.warnings[0]).toMatchObject({
      kind: "mode_drift",
      database: "chat",
      table: "messages",
      subject: "created_at",
    });
    expect(result.value.staleSiblings).toEqual([
      { slug: "list-messages", databases: ["chat"] },
    ]);
  });
});
