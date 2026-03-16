import type { Authenticator } from "@app/lib/auth";
import { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import memoizer from "lru-memoizer";

const DEEP_DIVE_DISABLED_TTL_MS = 3 * 1000; // 3 seconds

// Use memoizer's callback-based API so the LRU cache stores the resolved value, not a Promise.
// memoizer.sync with an async load caches the Promise itself, which retains Node async context and
// causes memory growth.
const _isDeepDiveDisabledByAdmin = memoizer<Authenticator, boolean>({
  load: (auth, callback) => {
    GlobalAgentSettingsModel.findOne({
      where: {
        workspaceId: auth.getNonNullableWorkspace().id,
        agentId: GLOBAL_AGENTS_SID.DEEP_DIVE,
      },
    })
      .then((settings) =>
        callback(null, settings?.status === "disabled_by_admin")
      )
      .catch((err: Error) => callback(err));
  },

  hash: (auth: Authenticator) =>
    `deep_dive_disabled_by_admin_${auth.getNonNullableWorkspace().id}`,

  max: 100,

  ttl: DEEP_DIVE_DISABLED_TTL_MS,
});

export const isDeepDiveDisabledByAdmin = (
  auth: Authenticator
): Promise<boolean> =>
  new Promise((resolve, reject) => {
    _isDeepDiveDisabledByAdmin(auth, (err: Error | null, result?: boolean) => {
      if (err) {
        reject(err);
      } else {
        resolve(result!);
      }
    });
  });
