import { agentCache } from "./agentCache.js";
import { toolsCache } from "./toolsCache.js";

export class CacheManager {
  static async invalidateAll(): Promise<void> {
    await agentCache.invalidate();
    await toolsCache.invalidate();
  }
}

export { agentCache } from "./agentCache.js";
export { toolsCache } from "./toolsCache.js";
