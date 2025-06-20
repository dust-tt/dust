import { agentCache } from "./agentCache.js";

export class CacheManager {
  static async invalidateAll(): Promise<void> {
    await agentCache.invalidate();
  }

  static async getCacheStats(): Promise<{
    exists: boolean;
    workspaceId?: string;
    agentCount?: number;
    age?: number;
    isExpired?: boolean;
  }> {
    return agentCache.getStats();
  }

  static async isValid(workspaceId: string): Promise<boolean> {
    return agentCache.isValid(workspaceId);
  }
}

export { agentCache } from "./agentCache.js";