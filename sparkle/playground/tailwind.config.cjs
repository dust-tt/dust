const path = require("path");

// Reference Sparkle's tailwind config from parent directory (no duplication).
// Content detection is handled by @source in CSS, not here.
const parentConfig = require(path.resolve(__dirname, "../tailwind.config.js"));

module.exports = {
  ...parentConfig,
};
