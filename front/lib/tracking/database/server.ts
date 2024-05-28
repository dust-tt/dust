import type { LightWorkspaceType } from "@dust-tt/types";

import { WorkspaceMetadata } from "@app/lib/models/workspace";

export class DatabaseServerSideTracking {
  static async trackSubscriptionCancel({
    workspace,
    cancelAt,
  }: {
    workspace: LightWorkspaceType;
    cancelAt?: Date;
  }) {
    const ts = cancelAt || new Date();

    await WorkspaceMetadata.upsert(
      {
        workspaceId: workspace.id,
        lastCancelAt: ts,
      },
      {
        conflictFields: ["workspaceId"],
      }
    );
  }

  static async trackSubscriptionReupgrade({
    workspace,
    reupgradeAt,
  }: {
    workspace: LightWorkspaceType;
    reupgradeAt?: Date;
  }) {
    const ts = reupgradeAt || new Date();

    await WorkspaceMetadata.upsert(
      {
        workspaceId: workspace.id,
        lastReupgradeAt: ts,
      },
      {
        conflictFields: ["workspaceId"],
      }
    );
  }
}
