import { SANDBOX_FUNCTIONS_TOOLS_METADATA } from "@app/lib/api/actions/servers/sandbox_functions/metadata";
import { publishHandler } from "@app/lib/api/actions/servers/sandbox_functions/tools/publish";
import { buildSandboxFunctionOnSandbox } from "@app/lib/api/sandbox_functions/build_on_sandbox";
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
  it("reports the app-prefixed slug and the reference a Frame needs", async () => {
    const { auth, conversation, projectId } = await setupProjectConversation();

    const result = await publishHandler(
      {
        slug: "add-task",
        description: "Add a task.",
        path: `pod-${projectId}/TaskList/functions/add-task.ts`,
        executionMode: "fast",
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(result.value).toEqual([
      {
        type: "text",
        text: `Published pod function "tasklist__add-task". Frames call it by reference "${projectId}/tasklist__add-task".`,
      },
    ]);
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
      },
      makeExtra(auth, conversation)
    );

    if (result.isErr()) {
      throw result.error;
    }
    expect(firstText(result.value)).not.toContain("Pod allowlist");
    expect(firstText(result.value)).not.toContain("Requested");
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
