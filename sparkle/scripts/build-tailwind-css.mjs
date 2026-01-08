import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tailwindcssPath = path.resolve(rootDir, "node_modules/.bin/tailwindcss");
const inputPath = path.resolve(rootDir, "src/styles/tailwind.css");
const outputPath = path.resolve(rootDir, "dist/sparkle.css");
const distDir = path.dirname(outputPath);

try {
  // Check if tailwindcss binary exists
  if (!fs.existsSync(tailwindcssPath)) {
    console.warn("⚠ tailwindcss not found, skipping CSS build");
    console.warn(`  Expected at: ${tailwindcssPath}`);
    console.warn("  This is normal if devDependencies are not installed");
    process.exit(0); // Exit successfully, don't fail the install
  }

  // Check if input file exists
  if (!fs.existsSync(inputPath)) {
    console.warn(`⚠ Tailwind input file not found: ${inputPath}`);
    process.exit(0);
  }

  // Ensure dist directory exists
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Run tailwindcss
  execSync(
    `"${tailwindcssPath}" -i "${inputPath}" -o "${outputPath}"`,
    { stdio: "inherit", cwd: rootDir }
  );
  
  console.log("✓ Generated sparkle.css");
} catch (error) {
  console.error("✗ Failed to build Tailwind CSS:", error.message);
  // Don't fail the install if CSS build fails
  process.exit(0);
}
