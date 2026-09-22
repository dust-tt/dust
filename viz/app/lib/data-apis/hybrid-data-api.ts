import type { CacheDataAPI } from "@viz/app/lib/data-apis/cache-data-api";
import type { RPCDataAPI } from "@viz/app/lib/data-apis/rpc-data-api";
import type { VisualizationDataAPI } from "@viz/app/lib/visualization-api";
import type { WriteFileParams } from "@viz/app/types";

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

  async readFile(path: string) {
    return this.cache.readFile(path);
  }

  async writeFile(params: WriteFileParams) {
    return this.cache.writeFile(params);
  }

  async fetchCode(): Promise<string | null> {
    return this.cache.fetchCode();
  }
}
