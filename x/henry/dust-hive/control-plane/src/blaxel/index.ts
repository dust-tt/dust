import type { Config } from "../config";
import { BlaxelSandboxProvider } from "./blaxel-provider";
import { FakeBlaxelProvider } from "./fake-provider";
import type { BlaxelProvider } from "./provider";

export function createProvider(config: Config): BlaxelProvider {
  if (config.provider === "fake") {
    return new FakeBlaxelProvider();
  }
  if (!config.beeImage) {
    throw new Error("HIVE_CP_BEE_IMAGE is required when HIVE_CP_PROVIDER=blaxel");
  }
  return new BlaxelSandboxProvider({
    image: config.beeImage,
    memoryMb: config.beeMemoryMb,
    repoPath: config.beeRepoPath,
  });
}
