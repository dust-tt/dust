import { Authenticator } from "@app/lib/auth";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { FeatureFlagFactory } from "@app/tests/utils/FeatureFlagFactory";
import { WorkspaceFactory } from "@app/tests/utils/WorkspaceFactory";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateAuditLogEvent } = vi.hoisted(() => ({
  mockCreateAuditLogEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@app/lib/api/workos/organization", () => ({
  createAuditLogEvent: mockCreateAuditLogEvent,
}));

import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  isAuditLogsEnabled,
} from "./workos_audit";

async function setDisableAuditLogs(workspaceSId: string, value: boolean) {
  const resource = await WorkspaceResource.fetchById(workspaceSId);
  if (!resource) {
    throw new Error(`Workspace not found: ${workspaceSId}`);
  }
  await resource.updateWorkspaceSettings({
    metadata: { ...(resource.metadata ?? {}), disableAuditLogs: value },
  });
}

// Re-fetches the auth so its workspace snapshot reflects metadata changes
// written after the previous fetch.
function freshAuth(workspaceSId: string) {
  return Authenticator.internalAdminForWorkspace(workspaceSId);
}

describe("isAuditLogsEnabled", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when the audit_logs feature flag is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await freshAuth(workspace.sId);
    await FeatureFlagFactory.basic(auth, "audit_logs");

    expect(await isAuditLogsEnabled(auth)).toBe(true);
  });

  it("returns false when metadata.disableAuditLogs is true, even if audit_logs is also set", async () => {
    const workspace = await WorkspaceFactory.basic();
    let auth = await freshAuth(workspace.sId);
    await FeatureFlagFactory.basic(auth, "audit_logs");
    await setDisableAuditLogs(workspace.sId, true);
    auth = await freshAuth(workspace.sId);

    expect(await isAuditLogsEnabled(auth)).toBe(false);
  });
});

describe("emitAuditLogEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls createAuditLogEvent when audit_logs is enabled", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await freshAuth(workspace.sId);
    await FeatureFlagFactory.basic(auth, "audit_logs");

    await emitAuditLogEvent({
      auth,
      action: "workspace.audit_logs_updated",
      targets: [buildAuditLogTarget("workspace", workspace)],
    });

    expect(mockCreateAuditLogEvent).toHaveBeenCalledTimes(1);
  });

  it("does not call createAuditLogEvent when metadata.disableAuditLogs is true", async () => {
    const workspace = await WorkspaceFactory.basic();
    let auth = await freshAuth(workspace.sId);
    await FeatureFlagFactory.basic(auth, "audit_logs");
    await setDisableAuditLogs(workspace.sId, true);
    auth = await freshAuth(workspace.sId);

    await emitAuditLogEvent({
      auth,
      action: "workspace.audit_logs_updated",
      targets: [buildAuditLogTarget("workspace", workspace)],
    });

    expect(mockCreateAuditLogEvent).not.toHaveBeenCalled();
  });

  it("truncates metadata values longer than 1000 chars", async () => {
    const workspace = await WorkspaceFactory.basic();
    const auth = await freshAuth(workspace.sId);
    await FeatureFlagFactory.basic(auth, "audit_logs");

    const longValue = "x".repeat(2000);
    const shortValue = "y".repeat(50);

    await emitAuditLogEvent({
      auth,
      action: "workspace.audit_logs_updated",
      targets: [buildAuditLogTarget("workspace", workspace)],
      metadata: {
        long_field: longValue,
        short_field: shortValue,
      },
    });

    expect(mockCreateAuditLogEvent).toHaveBeenCalledTimes(1);
    const eventArg = mockCreateAuditLogEvent.mock.calls[0][0].event;
    expect(eventArg.metadata.long_field.length).toBe(1000);
    expect(eventArg.metadata.long_field.endsWith("...[truncated]")).toBe(true);
    expect(eventArg.metadata.short_field).toBe(shortValue);
  });
});
