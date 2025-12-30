const path = require("path");

// Reference Sparkle's tailwind config from parent directory (no duplication)
const parentConfig = require(path.resolve(__dirname, "../tailwind.config.js"));

// Extend content paths to include playground source files
module.exports = {
  ...parentConfig,
  content: [
    ...(Array.isArray(parentConfig.content) ? parentConfig.content : [parentConfig.content]),
    "./src/**/*.{html,js,ts,jsx,tsx}",
    "../src/**/*.{html,js,ts,jsx,tsx}", // Also include Sparkle source for class detection
  ],
};

