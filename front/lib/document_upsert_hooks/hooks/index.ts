import type { ConnectorProvider, UpsertContext } from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import { documentTrackerUpsertHook } from "@app/lib/document_upsert_hooks/hooks/document_tracker";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";

const DUST_WORKSPACE = "0ec9852c2f";

const _hooks = {
  document_tracker_suggest_changes: documentTrackerUpsertHook,
} as const;

export const DOCUMENT_UPSERT_HOOKS: Array<DocumentUpsertHook> =
  Object.values(_hooks);

export type DocumentUpsertHook = {
  type: string;
  fn: (params: {
    auth: Authenticator;
    dataSourceId: string;
    documentId: string;
    documentHash: string;
    dataSourceConnectorProvider: ConnectorProvider | null;
    upsertContext?: UpsertContext;
  }) => Promise<void>;
};

export function runDocumentUpsertHooks(
  params: Parameters<DocumentUpsertHook["fn"]>[0]
): void {
  // TODO(document-tracker): remove this once we have a way to enable/disable
  if (params.auth.workspace()?.sId !== DUST_WORKSPACE) {
    return;
  }

  if (params.upsertContext?.sync_type !== "incremental") {
    // Skip hooks for batch syncs
    return;
  }

  for (const hook of DOCUMENT_UPSERT_HOOKS) {
    void wakeLock(async () => {
      try {
        await hook.fn(params);
      } catch (error) {
        logger.error(
          { hookType: hook.type, error },
          `Error running document upsert hook`
        );
      }
    });
  }
}
