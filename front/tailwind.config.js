/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");
const preset = require("@dust-tt/sparkle/tailwind-preset");

module.exports = {
  presets: [preset],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      containers: {
        xxxs: "16rem",
      },
      minWidth: (theme) => ({
        ...theme("spacing"),
        ...preset.sizeScale,
      }),
      minHeight: (theme) => ({
        ...theme("spacing"),
        ...preset.sizeScale,
      }),
      maxWidth: {
        48: "12rem",
        ...preset.sizeScale,
        conversation: "48rem", // max-w-3xl equivalent, used for conversation content area
      },
      maxHeight: {
        ...preset.sizeScale,
      },
      colors: {
        // Legacy duplicate of `border.dark` kept while callers migrate off.
        border: {
          darker: {
            DEFAULT: colors.gray[150],
            night: colors.gray[800],
          },
        },
      },
      keyframes: {
        appear: {
          "0%": { opacity: "0", width: "0" },
          "100%": { opacity: "1", width: "320px" },
        },
        "cursor-blink": {
          "0%": { opacity: 1 },
          "90%": { opacity: 1 },
          "100%": { opacity: 0 },
        },
        transitionProperty: {
          width: "width",
        },
        fadeout: {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
        reload: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(0.99)", opacity: "0.4" },
        },
        shake: {
          "0%, 100%": { transform: "translate3d(0, 0, 0)" },
          "20%, 60%": { transform: "translate3d(-1.5px, 0, 0)" },
          "40%, 80%": { transform: "translate3d(1.5px, 0, 0)" },
        },
        marquee: {
          "0%": { transform: "translate3d(0, 0, 0)" },
          "100%": { transform: "translate3d(-50%, 0, 0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        // Front overrides the preset's shared timings
        "move-square": "move-square 4s ease-out infinite",
        breathing: "breathing 4s infinite ease-in-out",
        "cursor-blink": "cursor-blink 0.9s infinite;",
        shake: "shake 0.5s ease-in-out both",
        reload: "reload 1000ms ease-out",
        fadeout: "fadeout 500ms ease-out",
        marquee: "marquee 25s linear infinite",
        "fade-in-up": "fade-in-up 0.5s ease-in-out",
      },
    },
  },
  safelist: [
    ...preset.buildSafelist({ avatarProps: "(bg|text)" }),
    "grid-rows-6",
    "grid-rows-7",
    "grid-rows-8",
  ],
};
