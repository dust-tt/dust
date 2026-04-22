import { Err, Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockDeleteSandboxPolicy,
  mockExecuteWithLock,
  mockGetDatadogApiKey,
  mockGetSandboxImage,
  mockGetSandboxProvider,
  mockWriteEmptySandboxPolicy,
} = vi.hoisted(() => ({
  mockDeleteSandboxPolicy: vi.fn(),
  mockExecuteWithLock: vi.fn(),
  mockGetDatadogApiKey: vi.fn(),
  mockGetSandboxImage: vi.fn(),
  mockGetSandboxProvider: vi.fn(),
  mockWriteEmptySandboxPolicy: vi.fn(),
}));

vi.mock("@app/lib/api/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/api/config")>();

  return {
    default: {
      ...actual.default,
      getDatadogApiKey: mockGetDatadogApiKey,
    },
  };
});

vi.mock("@app/lib/api/sandbox", () => ({
  getSandboxProvider: mockGetSandboxProvider,
}));

vi.mock("@app/lib/api/sandbox/egress_policy", () => ({
  deleteSandboxPolicy: mockDeleteSandboxPolicy,
  writeEmptySandboxPolicy: mockWriteEmptySandboxPolicy,
}));

vi.mock("@app/lib/api/sandbox/image", () => ({
  getSandboxImage: mockGetSandboxImage,
}));

vi.mock("@app/lib/lock", () => ({
  executeWithLock: mockExecuteWithLock,
}));

import type { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import type { ConversationType } from "@app/types/assistant/conversation";

describe("SandboxResource egress policy lifecycle", () => {
  let authenticator: Authenticator;
  let conversation: ConversationType;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockExecuteWithLock.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>) => fn()
    );
    mockGetDatadogApiKey.mockReturnValue(undefined);
    mockGetSandboxImage.mockReturnValue(
      new Ok({
        toCreateConfig: () => ({
          envVars: {},
          imageId: { imageName: "dust-base", tag: "latest" },
        }),
      })
    );
    mockWriteEmptySandboxPolicy.mockResolvedValue(new Ok(undefined));
    mockDeleteSandboxPolicy.mockResolvedValue(new Ok(undefined));

    const testSetup = await createResourceTest({ role: "admin" });
    authenticator = testSetup.authenticator;

    const agentConfig =
      await AgentConfigurationFactory.createTestAgent(authenticator);
    conversation = await ConversationFactory.create(authenticator, {
      agentConfigurationId: agentConfig.sId,
      messagesCreatedAt: [new Date()],
    });
  });

  it("writes an empty sandbox policy when creating a sandbox", async () => {
    const provider = makeProvider({
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-1" })),
    });
    mockGetSandboxProvider.mockReturnValue(provider);

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value.freshlyCreated).toBe(true);
      expect(result.value.wokeFromSleep).toBe(false);
    }
    expect(mockWriteEmptySandboxPolicy).toHaveBeenCalledWith("provider-1");
  });

  it("destroys the provider sandbox when policy initialization fails", async () => {
    const provider = makeProvider({
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-1" })),
      destroy: vi.fn().mockResolvedValue(new Ok(undefined)),
    });
    mockGetSandboxProvider.mockReturnValue(provider);
    mockWriteEmptySandboxPolicy.mockResolvedValue(
      new Err(new Error("policy write failed"))
    );

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("policy write failed");
    }
    expect(provider.destroy).toHaveBeenCalledWith("provider-1", {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    expect(
      await SandboxResource.fetchByConversationId(
        authenticator,
        conversation.sId
      )
    ).toBeNull();
  });

  it("recreates deleted sandboxes with a new policy file and cleans up the old one", async () => {
    const existingSandbox = await SandboxFactory.create(
      authenticator,
      conversation,
      { status: "deleted" }
    );
    const oldProviderId = existingSandbox.providerId;
    const provider = makeProvider({
      create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-2" })),
    });
    mockGetSandboxProvider.mockReturnValue(provider);

    const result = await SandboxResource.ensureActive(
      authenticator,
      conversation
    );

    expect(result.isOk()).toBe(true);
    expect(mockWriteEmptySandboxPolicy).toHaveBeenCalledWith("provider-2");
    expect(mockDeleteSandboxPolicy).toHaveBeenCalledWith(oldProviderId);

    const reloaded = await SandboxResource.fetchByConversationId(
      authenticator,
      conversation.sId
    );
    expect(reloaded?.providerId).toBe("provider-2");
    expect(reloaded?.status).toBe("running");
  });

  it("deletes the sandbox policy when deleting the sandbox resource", async () => {
    const sandbox = await SandboxFactory.create(authenticator, conversation);
    const provider = makeProvider();
    mockGetSandboxProvider.mockReturnValue(provider);

    const result = await SandboxResource.deleteByConversationId(
      authenticator,
      conversation.sId
    );

    expect(result).toEqual(new Ok(undefined));
    expect(provider.destroy).toHaveBeenCalledWith(sandbox.providerId, {
      workspaceId: authenticator.getNonNullableWorkspace().sId,
    });
    expect(mockDeleteSandboxPolicy).toHaveBeenCalledWith(sandbox.providerId);
    expect(
      await SandboxResource.fetchByConversationId(
        authenticator,
        conversation.sId
      )
    ).toBeNull();
  });
});

function makeProvider(overrides: Record<string, unknown> = {}) {
  return {
    create: vi.fn().mockResolvedValue(new Ok({ providerId: "provider-1" })),
    destroy: vi.fn().mockResolvedValue(new Ok(undefined)),
    exec: vi
      .fn()
      .mockResolvedValue(new Ok({ exitCode: 0, stderr: "", stdout: "" })),
    listFiles: vi.fn(),
    readFile: vi.fn(),
    sleep: vi.fn(),
    wake: vi.fn(),
    writeFile: vi.fn(),
    ...overrides,
  };
}
