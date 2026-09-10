import { TriggerModel } from "@app/lib/models/agent/triggers/triggers";
import type { ModelStaticWorkspaceAware } from "@app/lib/resources/storage/wrappers/workspace_models";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import type { TriggerStatus } from "@app/types/assistant/triggers";
import type { ModelId } from "@app/types/shared/model_id";

const TriggerModelWithBypass: ModelStaticWorkspaceAware<TriggerModel> =
  TriggerModel;

/**
 * DANGEROUS: Lists triggers across workspaces for maintenance scripts.
 * Should only be used in scripts, never in API routes or lib/api.
 */
export async function listTriggersForMaintenance(options: {
  workspaceId?: ModelId;
  status?: TriggerStatus;
}): Promise<TriggerResource[]> {
  const where: { workspaceId?: ModelId; status?: TriggerStatus } = {};
  if (options.workspaceId) {
    where.workspaceId = options.workspaceId;
  }
  if (options.status) {
    where.status = options.status;
  }
  // Workspace-scoped reads use the workspaceId index; all-workspace maintenance scans the table.
  const triggers = await TriggerModelWithBypass.findAll({
    where,
    // WORKSPACE_ISOLATION_BYPASS: Maintenance may intentionally select triggers across workspaces.
    dangerouslyBypassWorkspaceIsolationSecurity: !where.workspaceId,
  });
  return triggers.map(
    (trigger) => new TriggerResource(TriggerModel, trigger.get())
  );
}
