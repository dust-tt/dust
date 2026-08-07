import {
  AGENT_MEMORY_EDIT_TOOL_NAME,
  AGENT_MEMORY_RECORD_TOOL_NAME,
} from "@app/lib/api/actions/servers/agent_memory/metadata";
import {
  AGENT_MEMORY_WRITE_DISABLED_MESSAGE,
  TOOLS,
} from "@app/lib/api/actions/servers/agent_memory/tools/index";
import type { Authenticator } from "@app/lib/auth";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import { beforeEach, describe, expect, it } from "vitest";

describe("agent_memory write tools gated by the user_memory feature flag", () => {
  let auth: Authenticator;
  let agentConfiguration: LightAgentConfigurationType;

  beforeEach(async () => {
    const setup = await createResourceTest({});
    auth = setup.authenticator;
    agentConfiguration = await AgentConfigurationFactory.createTestAgent(auth, {
      name: "Test Agent",
    });
  });

  function makeExtra() {
    return {
      auth,
      runContext: {
        contextType: "agent_loop",
        agentConfiguration,
      },
      signal: new AbortController().signal,
    } as never;
  }

  function getTool(name: string) {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      throw new Error(`tool ${name} not found`);
    }
    return tool;
  }

  it("redirects record to personal memory when the flag is on", async () => {
    await FeatureFlagFactory.basic(auth, "user_memory");

    const result = await getTool(AGENT_MEMORY_RECORD_TOOL_NAME).handler(
      { entries: ["I prefer concise answers"] },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(AGENT_MEMORY_WRITE_DISABLED_MESSAGE);
    }
  });

  it("redirects edit to personal memory when the flag is on", async () => {
    await FeatureFlagFactory.basic(auth, "user_memory");

    const result = await getTool(AGENT_MEMORY_EDIT_TOOL_NAME).handler(
      { edits: [{ index: 0, content: "I prefer concise answers" }] },
      makeExtra()
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe(AGENT_MEMORY_WRITE_DISABLED_MESSAGE);
    }
  });

  it("records normally when the flag is off", async () => {
    const result = await getTool(AGENT_MEMORY_RECORD_TOOL_NAME).handler(
      { entries: ["I prefer concise answers"] },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
  });
});
