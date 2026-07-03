import { promises as fs } from "fs";
import { homedir } from "os";
import path from "path";

interface ToolsCacheOptions {
  cacheDir?: string;
}

type ToolsCacheKeyParams = {
  scope: string;
  agentName: string;
  mcpServerName: string;
  toolName: string;
};

type LegacyToolsCacheKeyParams = Omit<ToolsCacheKeyParams, "scope">;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function hasProjectRootMarker(directory: string): Promise<boolean> {
  return (
    (await pathExists(path.join(directory, ".git"))) ||
    (await pathExists(path.join(directory, "package.json")))
  );
}

export async function resolveToolsCacheScope(
  cwd = process.cwd()
): Promise<string> {
  const resolvedCwd = path.resolve(cwd);
  let currentDirectory = resolvedCwd;

  while (true) {
    if (await hasProjectRootMarker(currentDirectory)) {
      return currentDirectory;
    }

    const parentDirectory = path.dirname(currentDirectory);
    if (parentDirectory === currentDirectory) {
      return resolvedCwd;
    }

    currentDirectory = parentDirectory;
  }
}

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
    scope,
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): string {
    return `${scope}:${agentName}:${mcpServerName}:${toolName}`;
  }

  private createLegacyToolKey({
    agentName,
    mcpServerName,
    toolName,
  }: LegacyToolsCacheKeyParams): string {
    return `${agentName}:${mcpServerName}:${toolName}`;
  }

  public async getCachedApproval({
    scope,
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): Promise<boolean | null> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({
      scope,
      agentName,
      mcpServerName,
      toolName,
    });
    const legacyToolKey = this.createLegacyToolKey({
      agentName,
      mcpServerName,
      toolName,
    });
    const cachedEntry = cache.find(
      (entry) => entry === toolKey || entry === legacyToolKey
    );

    if (!cachedEntry) {
      return null;
    }

    return true;
  }

  public async setCachedApproval({
    scope,
    agentName,
    mcpServerName,
    toolName,
  }: ToolsCacheKeyParams): Promise<void> {
    const cache = await this.loadCache();
    const toolKey = this.createToolKey({
      scope,
      agentName,
      mcpServerName,
      toolName,
    });
    if (cache.includes(toolKey)) {
      return;
    }

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
