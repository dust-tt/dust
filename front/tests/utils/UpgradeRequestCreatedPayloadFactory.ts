import type { UpgradeRequestCreatedPayloadType } from "@app/lib/notifications/triggers/upgrade-request-created";

export function makeUpgradeRequestCreatedPayload(
  overrides: Partial<UpgradeRequestCreatedPayloadType> = {}
): UpgradeRequestCreatedPayloadType {
  return {
    workspaceId: "w_1",
    workspaceName: "Acme",
    requesterName: "Ada",
    requesterEmail: null,
    reason: "Big project",
    ...overrides,
  };
}
