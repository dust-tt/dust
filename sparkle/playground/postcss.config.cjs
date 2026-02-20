const path = require("path");

// Use playground's Tailwind config so content includes ./src (Analytics, etc.)
// Otherwise Tailwind only scans Sparkle's src and playground classes are missing
module.exports = {
  plugins: {
    tailwindcss: { config: path.resolve(__dirname, "tailwind.config.cjs") },
    autoprefixer: {},
  },
};
