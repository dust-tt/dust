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
      height: {
        title: TITLE_HEIGHT,
        container: "var(--panel-height)", // defined in global.css
      },
      fontWeight: {
        medium: "450",
        semibold: "550",
      },
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
        "input-bar-compact-in": {
          "0%": {
            opacity: "0.45",
            transform: "scale(0.82) translateY(18px)",
          },
          "55%": {
            opacity: "1",
            transform: "scale(1.05) translateY(-3px)",
          },
          "100%": {
            opacity: "1",
            transform: "scale(1) translateY(0)",
          },
        },
        "input-bar-compact-content-in": {
          "0%": {
            opacity: "0",
            transform: "translateX(-8px)",
          },
          "100%": {
            opacity: "1",
            transform: "translateX(0)",
          },
        },
        "input-bar-compact-nav-in": {
          "0%": {
            opacity: "0",
            transform: "scale(0.86) translateX(14px)",
          },
          "60%": {
            opacity: "1",
            transform: "scale(1.04) translateX(-2px)",
          },
          "100%": {
            opacity: "1",
            transform: "scale(1) translateX(0)",
          },
        },
        "saved-pulse": {
          "0%, 100%": { color: "inherit" },
          "15%": { color: "#86efac" },
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
        "input-bar-compact-in":
          "input-bar-compact-in 480ms cubic-bezier(0.34, 1.56, 0.64, 1) both",
        "input-bar-compact-content-in":
          "input-bar-compact-content-in 320ms ease-out 100ms both",
        "input-bar-compact-nav-in":
          "input-bar-compact-nav-in 420ms cubic-bezier(0.34, 1.56, 0.64, 1) 160ms both",
        "saved-pulse": "saved-pulse 2s ease-out",
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
