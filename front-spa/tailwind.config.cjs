// Extend the front tailwind config with SPA-specific content paths
const frontConfig = require("../front/tailwind.config.js");

module.exports = {
  ...frontConfig,
  content: [
    // SPA source files
    "./src/**/*.{js,ts,jsx,tsx}",
    // Front components used by SPA
    "../front/components/**/*.{js,ts,jsx,tsx}",
    // Front lib used by SPA
    "../front/lib/**/*.{js,ts,jsx,tsx}",
  ],
};
