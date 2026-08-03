import type { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import type { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";

/**
 * Data API for public frames viewed by an authenticated workspace member:
 * code and files are served from the SSR cache, callFunction goes over RPC.
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

  async fetchFile(fileId: string): Promise<File | null> {
    return this.cache.fetchFile(fileId);
  }

  async fetchCode(): Promise<string | null> {
    return this.cache.fetchCode();
  }
}
