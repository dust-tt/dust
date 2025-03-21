import type { PlatformType } from "@app/shared/services/platform";
import { isValidPlatform } from "@app/shared/services/platform";
import webpack from "webpack";

import { getConfig as getChromeConfig } from "../platforms/chrome/webpack.config";
import { getConfig as getFrontConfig } from "../platforms/front/webpack.config";

const configPerPlatform: Record<PlatformType, any> = {
  chrome: getChromeConfig,
  front: getFrontConfig,
};

async function main() {
  const platform = process.argv
    .find((arg) => arg.startsWith("--platform="))
    ?.split("=")[1];

  if (!isValidPlatform(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const getConfig = configPerPlatform[platform];

  const config = await getConfig({
    env: process.argv.includes("--release") ? "release" : "production",
    shouldBuild: process.argv.includes("--analyze") ? "analyze" : "prod",
  });
  const compiler = webpack(config);

  return new Promise<void>((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        console.error("Fatal error during Webpack build:", err);
        reject(err);
        return;
      }
      if (stats?.hasErrors()) {
        const info = stats.toJson();
        console.error("Webpack compilation errors:");
        info.errors?.forEach((error) => console.error(error));
      }
      if (stats?.hasWarnings()) {
        const info = stats.toJson();
        console.warn("Webpack compilation warnings:");
        info.warnings?.forEach((warning) => console.warn(warning));
      }
      resolve();
    });
  });
}

main().catch((err) => {
  console.error("Build process encountered an error:", err);
  process.exit(1);
});
