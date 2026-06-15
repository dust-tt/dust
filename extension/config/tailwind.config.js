/** @type {import('tailwindcss').Config} */
const frontConfig = require("../../front/tailwind.config.js");

// Extension extends front's config since they share the same theme,
// keyframes, animations, and color setup.
module.exports = {
  ...frontConfig,
};
