import type { PlatformType } from "@extension/shared/services/platform";
import { isValidPlatform } from "@extension/shared/services/platform";
import webpack from "webpack";
import WebpackDevServer from "webpack-dev-server";

import { getConfig as getChromeConfig } from "../platforms/chrome/webpack.config";
import { getConfig as getFirefoxConfig } from "../platforms/firefox/webpack.config";
import { getConfig as getFrontConfig } from "../platforms/front/webpack.config";

const configPerPlatform: Record<PlatformType, any> = {
  chrome: getChromeConfig,
  front: getFrontConfig,
  firefox: getFirefoxConfig,
};

async function main() {
  const platform = process.argv
    .find((arg) => arg.startsWith("--platform="))
    ?.split("=")[1];

  if (!isValidPlatform(platform)) {
    throw new Error(`Unknown platform: ${platform}`);
  }

  const getConfig = configPerPlatform[platform];

  const config = await getConfig({ env: "development", shouldBuild: "none" });
  const compiler = webpack(config);

  if (config.devServer) {
    const server = new WebpackDevServer(config.devServer, compiler);
    await server.start();
  } else {
    // Ignore node_modules AND the build output dirs. The Tailwind v4 `@source`
    // globs (e.g. `@source "../../platforms/**/*.{ts,tsx}"`) make the postcss
    // loader register `platforms/**` as a watched context directory. Since
    // webpack writes its output into `platforms/<platform>/build/`, watching
    // that dir without ignoring `build/` causes an infinite recompile loop:
    // each compile writes the output → the watcher fires → it recompiles again.
    compiler.watch(
      { ignored: ["**/node_modules", "**/build/**"] },
      async (err, res) => {
        if (err) {
          console.error(err);
        }
        if (res?.hasErrors) {
          console.error(res.compilation.errors);
        }
        console.log(
          `[Dust Extension][development] Webpack successfully compiled.`
        );
      }
    );
  }
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
