import config from "@app/lib/api/config";
import type { SandboxProvider } from "@app/lib/api/sandbox/provider";
import { E2BSandboxProvider } from "@app/lib/api/sandbox/providers/e2b";

let cachedProvider: SandboxProvider | undefined;

export function getSandboxProvider(): SandboxProvider | undefined {
  if (cachedProvider) {
    return cachedProvider;
  }

  const e2bConfig = config.getE2BSandboxConfig();
  if (!e2bConfig) {
    return undefined;
  }

  cachedProvider = new E2BSandboxProvider(e2bConfig);

  return cachedProvider;
}
