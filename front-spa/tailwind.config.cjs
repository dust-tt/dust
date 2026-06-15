// Extend the front tailwind config (content detection is handled by @source in CSS, not here).
const frontConfig = require("../front/tailwind.config.js");

module.exports = {
  ...frontConfig,
};
