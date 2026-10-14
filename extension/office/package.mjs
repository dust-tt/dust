import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const officeDir = path.dirname(fileURLToPath(import.meta.url));
const extensionDir = path.dirname(officeDir);

// Every Office platform gets its own directory on the shared origin.
// Add PowerPoint and Word here once their production builds are available.
export function packageOfficeAssets({
  rootDir = extensionDir,
  platforms = ["excel"],
} = {}) {
  const outputDir = path.join(rootDir, "office/dist");
  // Validate all inputs before removing a previous build.
  for (const platform of platforms) {
    if (!["excel", "powerpoint", "word"].includes(platform)) {
      throw new Error(`Unknown Office platform: ${platform}`);
    }
    for (const file of [
      "build/taskpane.html",
      "build/auth.html",
      "manifest.prod.xml",
    ]) {
      if (!existsSync(path.join(rootDir, "platforms", platform, file))) {
        throw new Error(`Missing ${platform}/${file}: build the platform first`);
      }
    }
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });
  cpSync(path.join(rootDir, "office/_headers"), path.join(outputDir, "_headers"));
  for (const platform of platforms) {
    const platformDir = path.join(rootDir, "platforms", platform);
    const destination = path.join(outputDir, platform);
    cpSync(path.join(platformDir, "build"), destination, { recursive: true });
    cpSync(
      path.join(platformDir, "manifest.prod.xml"),
      path.join(destination, "manifest.xml")
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  packageOfficeAssets();
}
