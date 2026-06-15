/** @type {import('tailwindcss').Config} */
const preset = require("./tailwind-preset");

module.exports = {
  presets: [preset],
  prefix: "s",
  theme: {
    extend: {
      fontWeight: {
        medium: "450",
        semibold: "550",
      },
      height: {
        175: "700px",
        // Semantic height classes matching dialog widths
        md: "448px",
        lg: "576px",
        xl: "768px",
        "2xl": "1024px",
      },
      backgroundImage: {
        "rainbow-gradient":
          "linear-gradient(90deg, #7AC6FF, #1C91FF, #a855f7, #4BABFF, #0A6CC6)",
      },
      keyframes: {
        pulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 4px var(--pulse-color)" },
        },
        "ring-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 #1C91FF50" },
          "50%": { boxShadow: "0 0 0 3px #1C91FF50" },
        },
        "opacity-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "background-position-spin": {
          "0%": { backgroundPosition: "top center" },
          "100%": { backgroundPosition: "bottom center" },
        },
        "shiny-text": {
          "0%": { "background-position": "calc(-200%) 0" },
          "100%": { "background-position": "calc(200%) 0" },
        },
        rainbow: {
          "0%": { "background-position": "0%" },
          "100%": { "background-position": "200%" },
        },
        "collapse-down": {
          from: { height: "0", opacity: "0" },
          to: {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
        },
        "collapse-up": {
          from: {
            height: "var(--radix-collapsible-content-height)",
            opacity: "1",
          },
          to: { height: "0", opacity: "0" },
        },
      },
      animation: {
        "shiny-text": "shiny-text 2s infinite",
        pulse: "pulse var(--duration) ease-out infinite",
        "ring-pulse": "ring-pulse 3s ease-out infinite",
        "opacity-pulse":
          "opacity-pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "background-position-spin":
          "background-position-spin 2000ms infinite alternate",
        rainbow: "rainbow var(--speed, 16s) infinite linear",
        "collapse-down": "collapse-down 150ms ease-out",
        "collapse-up": "collapse-up 150ms ease-out",
      },
    },
  },
};
