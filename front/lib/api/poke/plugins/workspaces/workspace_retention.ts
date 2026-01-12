import isNumber from "lodash/isNumber";

import { createPlugin } from "@app/lib/api/poke/types";
import {
  deleteWorkspaceRetentionDaysMetadata,
  getWorkspaceDataRetention,
  isValidWorkspaceRetentionDays,
  saveWorkspaceRetentionDaysMetadata,
} from "@app/lib/data_retention";
import {
  WORKSPACE_DEFAULT_RETENTION_DAYS,
  WORKSPACE_RETENTION_MAX_DAYS,
  WORKSPACE_RETENTION_MIN_DAYS,
} from "@app/temporal/scrub_workspace/config";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export const workspaceRetentionPlugin = createPlugin({
  manifest: {
    id: "workspace-retention",
    name: "Change Workspace Retention",
    description: `Change how long the workspace is retained before being scrubbed (default is ${WORKSPACE_DEFAULT_RETENTION_DAYS} days)`,
    resourceTypes: ["workspaces"],
    args: {
      retentionDays: {
        type: "number",
        label: "Retention Days",
        description: `Number of days to retain the workspace before scrubbing (${WORKSPACE_RETENTION_MIN_DAYS}-${WORKSPACE_RETENTION_MAX_DAYS}, or -1 for default ${WORKSPACE_DEFAULT_RETENTION_DAYS} days)`,
        async: true,
      },
    },
  },
  populateAsyncArgs: async (auth) => {
    const retentionDays = await getWorkspaceDataRetention(auth);

    return new Ok({
      retentionDays,
    });
  },
  execute: async (auth, _, args) => {
    const workspace = auth.getNonNullableWorkspace();
    const retentionDays = args.retentionDays ?? -1;

    if (retentionDays !== -1 && !isValidWorkspaceRetentionDays(retentionDays)) {
      return new Err(
        new Error(
          `Set -1 to use the default retention (${WORKSPACE_DEFAULT_RETENTION_DAYS} days), or a number between ${WORKSPACE_RETENTION_MIN_DAYS} and ${WORKSPACE_RETENTION_MAX_DAYS} to set a custom retention.`
        )
      );
    }

    let res: Result<void, Error>;
    let message: string;

    if (retentionDays !== -1) {
      res = await saveWorkspaceRetentionDaysMetadata(workspace, retentionDays);
      message = `Workspace retention period set to ${retentionDays} days.`;
    } else if (isNumber(workspace.metadata?.workspaceRetentionDays)) {
      res = await deleteWorkspaceRetentionDaysMetadata(workspace);
      message = `Workspace retention reset to default (${WORKSPACE_DEFAULT_RETENTION_DAYS} days).`;
    } else {
      res = new Ok(undefined);
      message = `Workspace retention is already using default (${WORKSPACE_DEFAULT_RETENTION_DAYS} days).`;
    }

    if (res.isErr()) {
      return res;
    }

    return new Ok({
      display: "text",
      value: message,
    });
  },
});
