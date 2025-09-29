import type { Authenticator } from "@app/lib/auth";
import { trackerUpsertHook } from "@app/lib/document_upsert_hooks/hooks/tracker";
import { wakeLock } from "@app/lib/wake_lock";
import logger from "@app/logger/logger";
import type { ConnectorProvider, UpsertContext } from "@app/types";

const _hooks = {
  tracker: trackerUpsertHook,
} as const;

const DOCUMENT_UPSERT_HOOKS: Array<DocumentUpsertHook> = Object.values(_hooks);

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
