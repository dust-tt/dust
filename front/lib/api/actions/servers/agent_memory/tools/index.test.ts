import {
  AGENT_MEMORY_EDIT_TOOL_NAME,
  AGENT_MEMORY_RECORD_TOOL_NAME,
} from "@app/lib/api/actions/servers/agent_memory/metadata";
import {
  AGENT_MEMORY_WRITE_DISABLED_MESSAGE,
  TOOLS,
} from "@app/lib/api/actions/servers/agent_memory/tools/index";
import type { Authenticator } from "@app/lib/auth";
import { AGENT_MEMORY_LIMIT } from "@app/lib/resources/agent_memory_resource";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import assert from "assert";
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

  it("succeeds with an eviction note rather than erroring when the memory is full", async () => {
    const record = (entries: string[]) =>
      getTool(AGENT_MEMORY_RECORD_TOOL_NAME).handler({ entries }, makeExtra());

    // The marker sits at the end of the entry that gets evicted, so the assertion below only holds
    // if the evicted content is reported in full rather than previewed.
    const marker = "the quarterly budget threshold is 40%";
    const half = (label: string) =>
      label.repeat(AGENT_MEMORY_LIMIT / 2 / label.length);

    await record([
      half("a").slice(0, AGENT_MEMORY_LIMIT / 2 - marker.length) + marker,
    ]);
    await record([half("b")]);

    const result = await record(["the entry that overflows the memory"]);

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      assert(content.type === "text");
      expect(content.text).toContain("the entry that overflows the memory");
      expect(content.text).toContain(
        "least recently updated entries were dropped"
      );
      expect(content.text).toContain(marker);
    }
  });

  it("succeeds with a skip note when a single entry exceeds the limit", async () => {
    const result = await getTool(AGENT_MEMORY_RECORD_TOOL_NAME).handler(
      { entries: ["x".repeat(AGENT_MEMORY_LIMIT + 1)] },
      makeExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      const [content] = result.value;
      assert(content.type === "text");
      expect(content.text).toContain("were not saved because each one exceeds");
    }
  });
});
