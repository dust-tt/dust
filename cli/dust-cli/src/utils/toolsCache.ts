import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

interface ToolsCacheOptions {
  cacheDir?: string;
}

type ToolsCacheKeyParams = {
  agentName: string;
  mcpServerName: string;
  toolName: string;
};

export class ToolsCache {
  private cacheDir: string;
  private cacheFilePath: string;

  constructor(options: ToolsCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.join(homedir(), ".dust-cli");
    this.cacheFilePath = path.join(this.cacheDir, "tool-cache.json");
  }

  private async ensureCacheDir(): Promise<void> {
    try {
      await fs.access(this.cacheDir);
    } catch {
      await fs.mkdir(this.cacheDir, { recursive: true });
    }
  }

  private async loadCache(): Promise<string[]> {
    try {
      await this.ensureCacheDir();
      try {
        const data = await fs.readFile(this.cacheFilePath, "utf8");
        return JSON.parse(data);
      } catch {
        return [];
      }
    } catch (error) {
      console.warn("Failed to load tools cache:", error);
      return [];
    }
  }

  private async saveCache(cache: string[]): Promise<void> {
    try {
      await this.ensureCacheDir();
      await fs.writeFile(
        this.cacheFilePath,
        JSON.stringify(cache, null, 2),
        "utf-8"
      );
    } catch (error) {
      console.warn("Failed to save tools cache:", error);
    }
  }

  private createToolKey({
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): string {
    return `${agentName}:${mcpServerName}:${toolName}`;
  }

  public async getCachedApproval({
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): Promise<boolean | null> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({ agentName, mcpServerName, toolName });
    const cachedEntry = cache.find((entry) => entry === toolKey);

    if (!cachedEntry) {
      return null;
    }

    return true;
  }

  public async setCachedApproval({
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): Promise<void> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({ agentName, mcpServerName, toolName });
    await this.saveCache([...cache, toolKey]);
  }

  async invalidate(): Promise<void> {
    try {
      await fs.unlink(this.cacheFilePath);
    } catch {
      // Ignore if file doesn't exist
    }
  }
}

// Export singleton instance
export const toolsCache = new ToolsCache();
