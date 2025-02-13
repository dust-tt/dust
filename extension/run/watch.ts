import webpack from "webpack";
import { getConfig } from "../config/webpack";

async function main() {
  const config = await getConfig({ env: "development", shouldBuild: "none" });
  // const compiler = webpack(config);
  // compiler.watch({ ignored: /node_modules/ }, async (err, res) => {
  //   if (err) {
  //     console.error(err);
  //   }
  //   if (res?.hasErrors) {
  //     console.error(res.compilation.errors);
  //   }
  //   console.log(`[Dust Extension][development] Webpack successfully compiled.`);
  // });

  const compiler = webpack(config);
  const WebpackDevServer = require("webpack-dev-server");
  const server = new WebpackDevServer({ port: 3010, hot: true }, compiler);
  await server.start();
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
