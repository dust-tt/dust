import type { GetAgentConfigurationsResponseType } from "@dust-tt/client";
import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

interface CachedAgentData {
  agents: AgentConfiguration[];
  timestamp: number;
  workspaceId: string;
  ttl: number;
}

interface AgentCacheOptions {
  ttl?: number; // TTL in milliseconds, defaults to 1 day
  cacheDir?: string;
}

export class AgentCache {
  private readonly ttl: number;
  private readonly cacheDir: string;
  private readonly cacheFileName = "agent-cache.json";

  constructor(options: AgentCacheOptions = {}) {
    this.ttl = options.ttl ?? 24 * 60 * 60 * 1000; // 1 day default
    this.cacheDir = options.cacheDir ?? path.join(homedir(), ".dust-cli");
  }

  private get cacheFilePath(): string {
    return path.join(this.cacheDir, this.cacheFileName);
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  async get(workspaceId: string): Promise<AgentConfiguration[] | null> {
    let cached: CachedAgentData | null = null;
    try {
      const data = await fs.readFile(this.cacheFilePath, "utf-8");
      cached = JSON.parse(data);
    } catch {
      return null;
    }

    if (!cached) {
      return null;
    }

    if (cached.workspaceId !== workspaceId) {
      return null;
    }

    const now = Date.now();
    const isExpired = now - cached.timestamp > cached.ttl;

    if (isExpired) {
      return null;
    }

    return cached.agents;
  }

  async set(workspaceId: string, agents: AgentConfiguration[]): Promise<void> {
    await this.ensureCacheDir();

    const cachedData: CachedAgentData = {
      agents,
      timestamp: Date.now(),
      workspaceId,
      ttl: this.ttl,
    };

    await fs.writeFile(
      this.cacheFilePath,
      JSON.stringify(cachedData, null, 2),
      "utf-8"
    );
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

export const agentCache = new AgentCache();
