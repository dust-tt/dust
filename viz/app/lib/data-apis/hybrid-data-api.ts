import type { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import type { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type { WriteFileParams } from "@viz/app/types";

/**
 * @cc [owner:flvndvd,label:security] shared-frame-file-access
 * Authenticated shared views MUST read current files and write through RPC, which enforces
 * the viewer's file permissions. Unavailable source files MAY fall back to the shared snapshot,
 * which MUST remain read-only without revision metadata. Frame code MUST stay in the SSR cache.
 */
export class HybridDataAPI implements VisualizationDataAPI {
  constructor(
    private readonly cache: CacheDataAPI,
    private readonly rpc: RPCDataAPI
  ) {}

  async callFunction(functionId: string, input?: unknown) {
    return this.rpc.callFunction(functionId, input);
  }

  async getUserIdentity() {
    return this.rpc.getUserIdentity();
  }

  async fetchFile(fileId: string) {
    const file = await this.rpc.fetchFile(fileId);
    return file ?? this.cache.fetchFile(fileId);
  }

  async writeFile(params: WriteFileParams) {
    return this.rpc.writeFile(params);
  }

  async fetchCode(): Promise<string | null> {
    return this.cache.fetchCode();
  }
}
