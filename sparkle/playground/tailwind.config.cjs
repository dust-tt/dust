const path = require("path");

// Reference Sparkle's tailwind config from parent directory (no duplication)
const parentConfig = require(path.resolve(__dirname, "../tailwind.config.js"));

// Resolve Sparkle source so Tailwind always scans it (custom theme classes like s-animate-ring-pulse)
const sparkleSrc = path.resolve(__dirname, "../src");

module.exports = {
  ...parentConfig,
  content: [
    "./src/**/*.{html,js,ts,jsx,tsx}",
    `${sparkleSrc}/**/*.{html,js,ts,jsx,tsx}`,
  ],
};
