import { isLegacyAclsEnabled } from "@app/lib/api/permissions/legacy_acls";
import { KillSwitchResource } from "@app/lib/resources/kill_switch_resource";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
  vi.useRealTimers();
});

it("starts on legacy reads, loads the switch, and refreshes for rollback", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });

  expect(isLegacyAclsEnabled()).toBe(true);
  await vi.waitFor(() => expect(isLegacyAclsEnabled()).toBe(false));

  await KillSwitchResource.enableKillSwitch("use_legacy_acls");
  vi.setSystemTime(Date.now() + 60_001);
  expect(isLegacyAclsEnabled()).toBe(false);
  await vi.waitFor(() => expect(isLegacyAclsEnabled()).toBe(true));
});
