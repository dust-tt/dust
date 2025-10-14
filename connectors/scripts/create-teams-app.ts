#!/usr/bin/env node

import { execSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface TeamsManifest {
  id: string;
  bots: Array<{
    botId: string;
  }>;
  composeExtensions: Array<{
    botId: string;
  }>;
  name: {
    short: string;
    full: string;
  };
}

interface IconSource {
  src: string;
  dest: string;
}

// Check if required environment variables are set
const requiredEnvs = ["MICROSOFT_BOT_ID"];
const missingEnvs = requiredEnvs.filter((env) => !process.env[env]);

if (missingEnvs.length > 0) {
  console.error("❌ Missing required environment variables:");
  missingEnvs.forEach((env) => console.error(`   ${env}`));
  console.error("\nPlease set these in your .env file or environment");
  process.exit(1);
}

// Generate a proper UUID if none provided
function generateUUID(): string {
  return crypto.randomUUID();
}

const BOT_ID = process.env.MICROSOFT_BOT_ID!;
const BOT_NAME = process.env.MICROSOFT_BOT_NAME || "dust";
const APP_ID = process.env.MICROSOFT_BOT_APP_ID || generateUUID();

console.log("🚀 Creating Teams app package...");

const dir = path.join(__dirname, "../teams-app-package");
// Read and update the manifest
const manifestPath = path.join(dir, "manifest.json");
const manifest: TeamsManifest = JSON.parse(
  fs.readFileSync(manifestPath, "utf8")
);

// Update with actual values
manifest.id = APP_ID;
manifest.bots[0] = { ...manifest.bots[0], botId: BOT_ID };
manifest.name.short = BOT_NAME;
manifest.name.full = BOT_NAME;

// Write updated manifest
const buildDir = path.join(dir, "build");
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir);
}

fs.writeFileSync(
  path.join(buildDir, "manifest.json"),
  JSON.stringify(manifest, null, 2)
);

// Copy or create icon files
const iconSources: IconSource[] = [
  { src: path.join(dir, "color.png"), dest: "color.png" },
  { src: path.join(dir, "outline.png"), dest: "outline.png" },
];

function createPlaceholderIcon(filePath: string, isOutline: boolean): void {
  // Create a simple SVG and convert to PNG (you might need to install sharp for actual PNG creation)
  const svgContent = `
<svg width="192" height="192" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" fill="${isOutline ? "transparent" : "#FF6B47"}" stroke="${isOutline ? "#FF6B47" : "none"}" stroke-width="${isOutline ? "8" : "0"}"/>
  <text x="96" y="110" text-anchor="middle" fill="${isOutline ? "#FF6B47" : "white"}" font-size="72" font-family="Arial">D</text>
</svg>`;

  // For now, just save as SVG (you can convert to PNG manually or install sharp)
  fs.writeFileSync(filePath.replace(".png", ".svg"), svgContent);
  console.log(`ℹ️  Created SVG placeholder, please convert to PNG manually`);
}

iconSources.forEach(({ src, dest }) => {
  const destPath = path.join(buildDir, dest);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, destPath);
    console.log(`✅ Copied ${dest}`);
  } else {
    // Create a simple placeholder icon if none exists
    console.log(`⚠️  Creating placeholder ${dest} (replace with actual icon)`);
    createPlaceholderIcon(destPath, dest.includes("outline"));
  }
});

// Create the app package
try {
  execSync(
    `cd "${buildDir}" && zip -r ../teams-app.zip manifest.json color.png outline.png`
  );
  console.log("✅ Teams app package created: teams-app-package/teams-app.zip");
  console.log("\nNext steps:");
  console.log("1. Upload teams-app.zip to Teams via Developer Portal");
  console.log("2. Make sure your ngrok tunnel is running");
  console.log(
    `3. Update Bot Framework endpoint to: YOUR_NGROK_URL/webhooks/${process.env.WEBHOOK_SECRET || "mywebhooksecret"}/teams_messages`
  );
} catch (error) {
  console.error(
    "❌ Failed to create zip package:",
    error instanceof Error ? error.message : "Unknown error"
  );
  console.log("📁 Files are available in: teams-app-build/");
}
