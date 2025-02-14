import { homedir } from "os";
import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import { join } from "path";

export interface TokenData {
  accessToken: string;
  refreshToken: string | undefined;
  expiresAt: number; // timestamp in milliseconds
}

export interface DustConfig {
  workspaceId: string;
  agentId: string;
}

const CONFIG_DIR = join(homedir(), ".config", "dust-mcp");
const TOKEN_FILE = join(CONFIG_DIR, "auth.json");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");
const LOG_FILE = join(CONFIG_DIR, "agent.log");

export async function ensureConfigDir(): Promise<void> {
  try {
    await mkdir(CONFIG_DIR, { recursive: true });
  } catch (error) {
    if ((error as { code?: string }).code !== "EEXIST") {
      throw error;
    }
  }
}

export async function saveTokens(tokens: TokenData): Promise<void> {
  await ensureConfigDir();
  await writeFile(TOKEN_FILE, JSON.stringify(tokens, null, 2), "utf-8");
}

export async function loadTokens(): Promise<TokenData | null> {
  try {
    const data = await readFile(TOKEN_FILE, "utf-8");
    return JSON.parse(data) as TokenData;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const tokens = await loadTokens();
  if (!tokens) {
    return false;
  }

  // Check if token is expired (with 5 minute buffer)
  const now = Date.now();
  return tokens.expiresAt > now + 5 * 60 * 1000;
}

export async function saveDustConfig(config: DustConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
}

export async function loadDustConfig(): Promise<DustConfig | null> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return JSON.parse(data) as DustConfig;
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function logToFile(message: string): Promise<void> {
  await ensureConfigDir();
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  await appendFile(LOG_FILE, logMessage);
}

export async function logJson(prefix: string, data: any): Promise<void> {
  await logToFile(`${prefix}: ${JSON.stringify(data, null, 2)}`);
}

export async function logError(error: string): Promise<void> {
  await logToFile(`ERROR: ${error}`);
}

export async function logFatalError(error: unknown): Promise<void> {
  await logToFile(`FATAL ERROR: ${error}`);
}

export function createAPILogger() {
  return {
    error: async (_args: Record<string, unknown>, _message: string) => {},
    info: async (_args: Record<string, unknown>, _message: string) => {},
    trace: async (_args: Record<string, unknown>, _message: string) => {},
    warn: async (_args: Record<string, unknown>, _message: string) => {},
  };
}
