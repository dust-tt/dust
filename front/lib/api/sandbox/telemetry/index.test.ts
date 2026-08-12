import config from "@app/lib/api/config";
import { renderRootCommand } from "@app/lib/api/sandbox/root_command";
import { startTelemetry } from "@app/lib/api/sandbox/telemetry";
import type { Authenticator } from "@app/lib/auth";
import type { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { ConversationFactory } from "@app/tests/utils/ConversationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { SandboxFactory } from "@app/tests/utils/SandboxFactory";
import { Ok } from "@app/types/shared/result";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("startTelemetry", () => {
  let auth: Authenticator;
  let sandbox: SandboxResource;

  beforeEach(async () => {
    vi.restoreAllMocks();

    const testSetup = await createResourceTest({ role: "admin" });
    auth = testSetup.authenticator;
    const agentConfiguration =
      await AgentConfigurationFactory.createTestAgent(auth);
    const conversation = await ConversationFactory.create(auth, {
      agentConfigurationId: agentConfiguration.sId,
      messagesCreatedAt: [new Date()],
    });
    sandbox = await SandboxFactory.create(auth, conversation);
  });

  it("atomically installs the dedicated key without using the systemd manager environment", async () => {
    const datadogApiKey = "sandbox-datadog-api-key";
    vi.spyOn(config, "getSandboxDatadogApiKey").mockReturnValue(datadogApiKey);
    const execRoot = vi.spyOn(sandbox, "execRoot").mockResolvedValue(
      new Ok({
        exitCode: 0,
        stdout: "",
        stderr: "",
      })
    );

    const result = await startTelemetry(auth, sandbox, {
      kind: "conversation",
      conversationId: "conv_telemetry_test",
      spaceId: null,
    });

    expect(result.isOk()).toBe(true);
    expect(execRoot).toHaveBeenCalledTimes(1);
    const [, command, options] = execRoot.mock.calls[0];
    const renderedCommand = renderRootCommand(command);
    expect(renderedCommand).not.toContain("systemctl set-environment");
    expect(renderedCommand).not.toContain("systemctl unset-environment");
    expect(renderedCommand).toContain("umask 077");
    expect(renderedCommand).toContain("/bin/chmod 600");
    expect(renderedCommand).toContain("/bin/mv -f /run/dust/fluent-bit.env.");
    expect(renderedCommand).toContain(
      "/run/dust/fluent-bit.env && /usr/bin/systemctl restart fluent-bit"
    );
    expect(renderedCommand).not.toContain(datadogApiKey);
    expect(options).not.toHaveProperty("stdin");
    expect(options?.envVars).toEqual({
      DD_HOST: "http-intake.logs.datadoghq.eu",
      DD_API_KEY: datadogApiKey,
      E2B_SANDBOX_ID: sandbox.providerId,
      CONVERSATION_ID: "conv_telemetry_test",
      WORKSPACE_ID: auth.getNonNullableWorkspace().sId,
    });
  });

  it("fails closed when the dedicated sandbox key is missing", async () => {
    vi.spyOn(config, "getSandboxDatadogApiKey").mockReturnValue(undefined);
    const execRoot = vi.spyOn(sandbox, "execRoot");

    const result = await startTelemetry(auth, sandbox, {
      kind: "pod",
      spaceId: "space_telemetry_test",
    });

    expect(result.isErr()).toBe(true);
    expect(execRoot).not.toHaveBeenCalled();
    if (result.isErr()) {
      expect(result.error.message).toContain("SANDBOX_DD_API_KEY");
    }
  });

  it("rejects values that could inject another EnvironmentFile entry", async () => {
    vi.spyOn(config, "getSandboxDatadogApiKey").mockReturnValue(
      "sandbox-key\nSECOND_SECRET=exposed"
    );
    const execRoot = vi.spyOn(sandbox, "execRoot");

    const result = await startTelemetry(auth, sandbox, {
      kind: "pod",
      spaceId: "space_telemetry_test",
    });

    expect(result.isErr()).toBe(true);
    expect(execRoot).not.toHaveBeenCalled();
  });

  it("reports a non-zero service restart as an error", async () => {
    vi.spyOn(config, "getSandboxDatadogApiKey").mockReturnValue(
      "sandbox-datadog-api-key"
    );
    vi.spyOn(sandbox, "execRoot").mockResolvedValue(
      new Ok({
        exitCode: 1,
        stdout: "",
        stderr: "fluent-bit failed",
      })
    );

    const result = await startTelemetry(auth, sandbox, {
      kind: "pod",
      spaceId: "space_telemetry_test",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("fluent-bit failed");
    }
  });
});
