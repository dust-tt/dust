import type { PlatformType } from "@app/shared/services/platform";
import { isValidPlatform } from "@app/shared/services/platform";
import webpack from "webpack";
import WebpackDevServer from "webpack-dev-server";

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

  const config = await getConfig({ env: "development", shouldBuild: "none" });
  const compiler = webpack(config);

  if (config.devServer) {
    const server = new WebpackDevServer(config.devServer, compiler);
    await server.start();
  } else {
    compiler.watch({ ignored: /node_modules/ }, async (err, res) => {
      if (err) {
        console.error(err);
      }
      if (res?.hasErrors) {
        console.error(res.compilation.errors);
      }
      console.log(
        `[Dust Extension][development] Webpack successfully compiled.`
      );
    });
  }
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
