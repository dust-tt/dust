import webpack from "webpack";
import { getEnv } from "../config/env";
import { getConfig } from "../config/webpack";

async function main() {
  const environment = getEnv();
  const config = await getConfig({ shouldBuild: "none" });
  const compiler = webpack(config);
  compiler.watch({ ignored: /node_modules/ }, async (err) => {
    if (err) {
      console.error(err);
    }
    console.log(
      `[Dust Extension][${environment}] Webpack successfully compiled.`
    );
  });
}

main().catch((err) => {
  console.log(err);
  process.exit(1);
});
