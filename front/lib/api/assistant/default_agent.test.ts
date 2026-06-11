import { resolveHomeDefaultAgentSId } from "@app/lib/api/assistant/default_agent";
import { AgentConfigurationFactory } from "@app/tests/utils/AgentConfigurationFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import {
  GLOBAL_AGENTS_SID,
  HOME_DEFAULT_AGENT_METADATA_KEY,
} from "@app/types/assistant/assistant";
import { describe, expect, it } from "vitest";

describe("resolveHomeDefaultAgentSId", () => {
  it("falls back to @dust when the user has no default set", async () => {
    const { authenticator } = await createResourceTest({ role: "user" });

    const sId = await resolveHomeDefaultAgentSId(authenticator);

    expect(sId).toBe(GLOBAL_AGENTS_SID.DUST);
  });

  it("returns the user's default when it is set and accessible", async () => {
    const { authenticator, user } = await createResourceTest({ role: "user" });
    const agent =
      await AgentConfigurationFactory.createTestAgent(authenticator);

    await user.setMetadata(
      HOME_DEFAULT_AGENT_METADATA_KEY,
      agent.sId,
      authenticator.getNonNullableWorkspace().id
    );

    const sId = await resolveHomeDefaultAgentSId(authenticator);

    expect(sId).toBe(agent.sId);
  });

  it("falls back to @dust when the stored default is no longer accessible", async () => {
    const { authenticator, user } = await createResourceTest({ role: "user" });

    // An sId that does not correspond to any agent in the workspace.
    await user.setMetadata(
      HOME_DEFAULT_AGENT_METADATA_KEY,
      "agent_does_not_exist",
      authenticator.getNonNullableWorkspace().id
    );

    const sId = await resolveHomeDefaultAgentSId(authenticator);

    expect(sId).toBe(GLOBAL_AGENTS_SID.DUST);
  });
});
