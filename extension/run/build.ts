import webpack from "webpack";
import { getConfig } from "../config/webpack";

async function main() {
  const config = await getConfig({
    env: "production",
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
