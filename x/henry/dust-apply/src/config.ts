import * as path from "path";
import * as os from "os";
import { fileSystem } from "./fs_utils";

const CONFIG_FILE = path.join(os.homedir(), ".dust-apply.json");

export type Config = {
  apiKey: string;
  workspaceId: string;
};

async function loadConfig(): Promise<Config> {
  if (!(await fileSystem.exists(CONFIG_FILE))) {
    console.error(
      "Config file not found. Run: dust-apply config <apiKey> <workspaceId>"
    );
    process.exit(1);
  }
  const text = await fileSystem.readText(CONFIG_FILE);
  if (!text) {
    console.error(
      "Config file is empty. Run: dust-apply config <apiKey> <workspaceId>"
    );
    process.exit(1);
  }
  return JSON.parse(text);
}

async function saveConfig(config: Config) {
  await fileSystem.writeText(CONFIG_FILE, JSON.stringify(config, null, 2));
}

export { loadConfig, saveConfig };
