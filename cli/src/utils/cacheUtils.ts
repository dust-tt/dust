import { agentCache } from "./agentCache.js";

export class CacheManager {
  static async invalidateAll(): Promise<void> {
    await agentCache.invalidate();
  }
}

export { agentCache } from "./agentCache.js";
