import { getGlobalAgents } from "@app/lib/api/assistant/global_agents/global_agents";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { createResourceTest } from "@app/tests/utils/generic_resource_tests";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { MembershipRoleType } from "@app/types/memberships";
import { describe, expect, it } from "vitest";

async function fetchAnalyst(role: MembershipRoleType, flagOn: boolean) {
  const { authenticator } = await createResourceTest({ role });
  if (flagOn) {
    await FeatureFlagFactory.basic(authenticator, "workspace_analytics");
  }
  return getGlobalAgents(authenticator, [GLOBAL_AGENTS_SID.ANALYST], "light");
}

describe("analyst global agent visibility", () => {
  it("is available to admins when the flag is on", async () => {
    const agents = await fetchAnalyst("admin", true);
    expect(agents).toHaveLength(1);
    expect(agents[0].sId).toBe(GLOBAL_AGENTS_SID.ANALYST);
    expect(agents[0].name).toBe("analyst");
    expect(agents[0].skills).toContain("workspace-analytics");
    expect(agents[0].skills).toContain("frames");
  });

  it("is hidden from admins when the flag is off", async () => {
    expect(await fetchAnalyst("admin", false)).toEqual([]);
  });

  it("is hidden from builders even when the flag is on", async () => {
    expect(await fetchAnalyst("builder", true)).toEqual([]);
  });

  it("is hidden from regular users even when the flag is on", async () => {
    expect(await fetchAnalyst("user", true)).toEqual([]);
  });
});
