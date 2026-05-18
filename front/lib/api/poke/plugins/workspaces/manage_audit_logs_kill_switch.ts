import {
  buildAuditLogTarget,
  emitAuditLogEvent,
} from "@app/lib/api/audit/workos_audit";
import { createPlugin } from "@app/lib/api/poke/types";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { mapToEnumValues } from "@app/types/poke/plugins";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const AUDIT_LOGS_KILL_SWITCH_OPERATIONS = ["disable", "enable"] as const;
type AuditLogsKillSwitchOperation =
  (typeof AUDIT_LOGS_KILL_SWITCH_OPERATIONS)[number];

function isAuditLogsKillSwitchOperation(
  operation: string
): operation is AuditLogsKillSwitchOperation {
  return AUDIT_LOGS_KILL_SWITCH_OPERATIONS.some((o) => o === operation);
}

export const auditLogsKillSwitchPlugin = createPlugin({
  manifest: {
    id: "audit-logs-kill-switch",
    name: "Audit Logs Kill Switch",
    description:
      "Disable or re-enable audit logs for the workspace. When disabled, the audit logs section is hidden and no events are emitted to WorkOS — overrides plan and the audit_logs feature flag.",
    resourceTypes: ["workspaces"],
    args: {
      operation: {
        type: "enum",
        label: "Operation",
        description:
          "Disable to stop emitting audit events and hide the audit logs section. Enable to restore them.",
        values: mapToEnumValues(AUDIT_LOGS_KILL_SWITCH_OPERATIONS, (value) => ({
          label: value,
          value,
        })),
        multiple: false,
      },
    },
  },
  execute: async (auth, workspace, args) => {
    if (!workspace) {
      return new Err(new Error("Cannot find workspace."));
    }

    const operationArg = args.operation[0];
    if (!operationArg || !isAuditLogsKillSwitchOperation(operationArg)) {
      return new Err(new Error(`Invalid operation: ${operationArg}`));
    }

    const workspaceResource = await WorkspaceResource.fetchById(workspace.sId);
    if (!workspaceResource) {
      return new Err(new Error(`Workspace not found: wId='${workspace.sId}'`));
    }

    const disableAuditLogs = operationArg === "disable";
    const previousMetadata = workspaceResource.metadata ?? {};
    // Short-circuit when the state is unchanged so we don't write a no-op
    // row or emit a noisy audit event.
    if (previousMetadata.disableAuditLogs === disableAuditLogs) {
      return new Ok({
        display: "text",
        value: `Audit logs were already ${disableAuditLogs ? "disabled" : "enabled"} for workspace "${workspace.name}".`,
      });
    }

    const [affectedCount] = await workspaceResource.updateWorkspaceSettings({
      metadata: { ...previousMetadata, disableAuditLogs },
    });
    if (affectedCount === 0) {
      return new Err(
        new Error(
          `Failed to update audit logs metadata for workspace "${workspace.name}".`
        )
      );
    }

    void emitAuditLogEvent({
      auth,
      action: "workspace.audit_logs_updated",
      targets: [buildAuditLogTarget("workspace", workspace)],
      metadata: {
        enabled: String(!disableAuditLogs),
        source: "poke",
      },
    });

    switch (operationArg) {
      case "disable":
        return new Ok({
          display: "text",
          value: `Audit logs are now disabled for workspace "${workspace.name}".`,
        });
      case "enable":
        return new Ok({
          display: "text",
          value: `Audit logs are now enabled for workspace "${workspace.name}".`,
        });
      default:
        return assertNever(operationArg);
    }
  },
});
