import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { publishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
import {
  computeSandboxFunctionBundleSha256,
  SandboxFunctionResource,
  shortSandboxFunctionBundleSha256,
} from "@app/lib/resources/sandbox_function_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  makeExtra,
  setupProjectConversation,
} from "@app/tests/utils/conversation_test_factories";
import { fileStorageMock } from "@app/tests/utils/mocks/file_storage";
import { Ok } from "@app/types/shared/result";
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

vi.mock("@app/lib/lock", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/lock")>();
  return {
    ...actual,
    executeWithLock: async (
      _lockName: string,
      callback: () => Promise<unknown>
    ) => callback(),
  };
});

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

beforeEach(() => {
  vi.clearAllMocks();
  fileStorageMock.reset();
  fileStorageMock.setFetchFileContentNotFound(() => true);
  vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
    new Ok({
      bundleCode: "export default {};",
      userIdentity: "optional",
      inputSchema,
      outputSchema,
    })
  );
});

function firstText(content: Array<{ type: string; text?: string }>): string {
  const first = content[0];
  return first.type === "text" ? (first.text ?? "") : "";
}

describe("publishHandler", () => {
  it("reports the app-prefixed slug, the publish receipt, and the reference a Frame needs", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await publishHandler(
      {
        slug: "add-task",
        description: "Add a task.",
        path: `pod-${projectId}/TaskList/functions/add-task.ts`,
        executionMode: "fast",
        defaultStake: "low",
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const [block] = result.value;
    expect(block).toMatchObject({ type: "text" });
    if (block?.type !== "text") {
      return;
    }
    expect(block.text).toContain('Published pod function "tasklist__add-task"');
    expect(block.text).toContain(
      `Frames call it by reference "${projectId}/tasklist__add-task".`
    );
    // The receipt names the mode, timestamp and bundle hash so the caller can verify the
    // publish landed through list/get.
    expect(block.text).toContain("executionMode: fast");
    expect(block.text).toContain("updatedAt: ");
    const expectedShortSha = shortSandboxFunctionBundleSha256(
      computeSandboxFunctionBundleSha256("export default {};")
    );
    expect(block.text).toContain(`bundle: ${expectedShortSha}`);
    // A first publish must not claim byte-identity with anything.
    expect(block.text).not.toContain("byte-identical");
  });

  it("flags a re-publish whose built bundle did not change", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const input = {
      slug: "add-task",
      description: "Add a task.",
      path: `pod-${projectId}/TaskList/functions/add-task.ts`,
      executionMode: "fast" as const,
      defaultStake: "low" as const,
    };

    const first = await publishHandler(input, makeExtra(auth, conversation));
    if (first.isErr()) {
      throw first.error;
    }

    // The mocked build returns the same bundle, so the republish changes nothing: the result
    // must say so instead of letting the caller believe an edit landed.
    const second = await publishHandler(input, makeExtra(auth, conversation));
    if (second.isErr()) {
      throw second.error;
    }
    const [block] = second.value;
    if (block?.type !== "text") {
      throw new Error("Expected a text block.");
    }
    expect(block.text).toContain("byte-identical to the previous publish");
  });

  it("records declared domains as Pod requests, even for an admin publisher", async () => {
    const { auth, conversation, projectId } =
      await setupProjectConversation("admin");

    const result = await publishHandler(
      {
        slug: "charge",
        description: "Charge a card.",
        path: `pod-${projectId}/Billing/functions/charge.ts`,
        executionMode: "fast",
        defaultStake: "low",
        domains: ["API.Stripe.COM", "*.stripe.com"],
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(firstText(result.value)).toContain("Requested for the Pod");

    const policyPath = `w/${auth.getNonNullableWorkspace().sId}/sandboxes/${projectId}.json`;
    const policy = JSON.parse(fileStorageMock.getObject(policyPath) ?? "{}");
    expect(policy.allowedDomains).toEqual([]);
    expect(
      policy.requestedDomains.map((r: { domain: string }) => r.domain)
    ).toEqual(["api.stripe.com", "*.stripe.com"]);
  });

  it("publishes with no domain note when no domains are declared", async () => {
    const { auth, conversation, projectId } =
      await setupProjectConversation("admin");

    const result = await publishHandler(
      {
        slug: "greet",
        description: "Greet.",
        path: `pod-${projectId}/App/functions/greet.ts`,
        executionMode: "fast",
        defaultStake: "low",
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(firstText(result.value)).not.toContain("Pod allowlist");
    expect(firstText(result.value)).not.toContain("Requested");
  });

  it("persists the declared default stake", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    const pod = await SpaceResource.fetchById(auth, projectId);
    if (!pod) {
      throw new Error("pod not found");
    }

    const result = await publishHandler(
      {
        slug: "read-task",
        description: "Read a task.",
        path: `pod-${projectId}/TaskList/functions/read-task.ts`,
        executionMode: "fast",
        defaultStake: "never_ask",
      },
      makeExtra(auth, conversation)
    );
    if (result.isErr()) {
      throw result.error;
    }

    expect(
      (
        await SandboxFunctionResource.fetchBySpaceAndSlug(
          auth,
          pod,
          "tasklist__read-task"
        )
      )?.defaultStake
    ).toBe("never_ask");
  });

  it("requires a default stake on every publish", () => {
    const metadata = SANDBOX_FUNCTIONS_TOOLS_METADATA.find(
      (tool) => tool.name === "publish"
    );

    expect(metadata).toBeDefined();
    expect(metadata?.schema.defaultStake.safeParse(undefined).success).toBe(
      false
    );
    expect(metadata?.schema.defaultStake.safeParse("medium").success).toBe(
      false
    );
    expect(metadata?.schema.defaultStake.safeParse("never_ask").success).toBe(
      true
    );
  });

  it("appends the fast tool-call warning without blocking the publish", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: 'const res = spawnSync("dsbx", ["tools", "call"]);',
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const result = await publishHandler(
      {
        slug: "sync-data",
        description: "Sync data.",
        path: `pod-${projectId}/TaskList/functions/sync-data.ts`,
        executionMode: "fast",
        defaultStake: "low",
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const [block] = result.value;
    if (block?.type !== "text") {
      throw new Error("Expected a text block.");
    }
    // The publish still lands; the warning rides the result.
    expect(block.text).toContain(
      'Published pod function "tasklist__sync-data"'
    );
    expect(block.text).toContain("fast_function_called_tools");
    expect(block.text).toContain("confirmFast");
  });

  it("silences the fast tool-call warning when confirmFast is passed", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();
    vi.mocked(buildSandboxFunctionOnSandbox).mockResolvedValue(
      new Ok({
        bundleCode: 'const res = spawnSync("dsbx", ["tools", "call"]);',
        userIdentity: "optional",
        inputSchema,
        outputSchema,
      })
    );

    const result = await publishHandler(
      {
        slug: "sync-data",
        description: "Sync data.",
        path: `pod-${projectId}/TaskList/functions/sync-data.ts`,
        executionMode: "fast",
        defaultStake: "low",
        confirmFast: true,
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    const [block] = result.value;
    if (block?.type !== "text") {
      throw new Error("Expected a text block.");
    }
    expect(block.text).toContain(
      'Published pod function "tasklist__sync-data"'
    );
    expect(block.text).not.toContain("fast_function_called_tools");
  });

  it("accepts a bare function name but not one that already carries a prefix", () => {
    const metadata = SANDBOX_FUNCTIONS_TOOLS_METADATA.find(
      (tool) => tool.name === "publish"
    );

    expect(metadata).toBeDefined();
    expect(metadata?.schema.slug.safeParse("add-task").success).toBe(true);
    // Publish derives the prefix from `path`, so the caller must not supply one.
    expect(metadata?.schema.slug.safeParse("tasklist__add-task").success).toBe(
      false
    );
    expect(metadata?.schema.slug.safeParse("Add Task").success).toBe(false);
  });
});
