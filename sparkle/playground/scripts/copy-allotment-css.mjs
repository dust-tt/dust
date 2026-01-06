import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const playgroundDir = path.resolve(__dirname, "..");
const sparkleDir = path.resolve(playgroundDir, "..");
const sourcePath = path.resolve(
  sparkleDir,
  "node_modules/allotment/dist/style.css"
);
const destPath = path.resolve(sparkleDir, "src/styles/allotment.css");

try {
  // Check if source exists
  if (fs.existsSync(sourcePath)) {
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    
    fs.copyFileSync(sourcePath, destPath);
    console.log("✓ Copied allotment CSS to src/styles/allotment.css");
  } else {
    console.warn("⚠ allotment CSS not found, skipping copy");
    console.warn(`  Expected at: ${sourcePath}`);
  }
} catch (error) {
  console.error("✗ Failed to copy allotment CSS:", error);
  process.exit(1);
}

