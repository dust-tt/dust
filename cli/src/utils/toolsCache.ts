import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  promises as fs,
} from "fs";
import { homedir } from "os";
import path from "path";

interface ToolsCacheOptions {
  cacheDir?: string;
}

export class ToolsCache {
  private cacheDir: string;
  private cacheFilePath: string;

  constructor(options: ToolsCacheOptions = {}) {
    this.cacheDir = options.cacheDir ?? path.join(homedir(), ".dust-cli");
    this.cacheFilePath = path.join(this.cacheDir, "tool-cache.json");
    this.ensureCacheDir();
  }

  private ensureCacheDir(): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  private loadCache(): string[] {
    try {
      if (!existsSync(this.cacheFilePath)) {
        return [];
      }
      const data = readFileSync(this.cacheFilePath, "utf8");
      return JSON.parse(data);
    } catch (error) {
      console.warn("Failed to load tools cache:", error);
      return [];
    }
  }

  private saveCache(cache: string[]): void {
    try {
      this.ensureCacheDir();
      writeFileSync(
        this.cacheFilePath,
        JSON.stringify(cache, null, 2),
        "utf-8"
      );
      console.log("Tools cache saved successfully.");
      console.log("current cache:", cache);
    } catch (error) {
      console.warn("Failed to save tools cache:", error);
    }
  }

  private createToolKey(
    agentName: string,
    mcpServerName: string,
    toolName: string
  ): string {
    return `${agentName}:${mcpServerName}:${toolName}`;
  }

  public getCachedApproval(
    agentName: string,
    toolName: string,
    mcpServerName: string
  ): boolean | null {
    const cache = this.loadCache();
    const toolKey = this.createToolKey(agentName, mcpServerName, toolName);
    const cachedEntry = cache.find((entry) => entry === toolKey);

    if (!cachedEntry) {
      return null;
    }

    return true;
  }

  public setCachedApproval(
    agentName: string,
    toolName: string,
    mcpServerName: string
  ): void {
    const cache = this.loadCache();
    const toolKey = this.createToolKey(agentName, mcpServerName, toolName);
    this.saveCache([...cache, toolKey]);
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
