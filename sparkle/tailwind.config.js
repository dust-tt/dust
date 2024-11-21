/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");

const safeColorsArray = [
  "action",
  "amber",
  "blue",
  "cyan",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "teal",
  "violet",
  "warning",
  "yellow",
];

const safeColorlist = safeColorsArray.flatMap((color) => [
  // Whitelist all bg colors from shade 100 t0 800.
  ...Array.from({ length: 8 }, (_, i) => `s-bg-${color}-${(i + 1) * 100}`),
  `s-border-${color}-100`,
  `s-border-${color}-200`,
  `s-border-${color}-300`,
  `s-text-${color}-500`,
  `s-text-${color}-800`,
  `s-text-${color}-900`,
  `s-text-${color}-950`,
]);
module.exports = {
  theme: {
    fontFamily: {
      sans: ["'darkmode-off-cc'", "sans-serif"],
      objektiv: ["'objektiv-mk1'", "sans-serif"],
    },
    extend: {
      scale: {
        99: ".99",
      },
      dropShadow: {
        DEFAULT: "0 2px 4px rgba(15, 23, 42, 0.1)",
        sm: "0 1px 2px rgba(15, 23, 42, 0.08)",
        md: "0 4px 6px rgba(15, 23, 42, 0.12)",
        lg: "0 10px 15px rgba(15, 23, 42, 0.12)",
        xl: "0 20px 20px rgba(15, 23, 42, 0.12)",
        "2xl": "0 25px 35px rgba(15, 23, 42, 0.12)",
      },
      boxShadow: {
        DEFAULT: "0 2px 6px 0 rgba(15, 23, 42, 0.1)",
        md: "0 4px 12px rgba(15, 23, 42, 0.12)",
        lg: "0 10px 20px rgba(15, 23, 42, 0.12)",
        xl: "0 20px 25px rgba(15, 23, 42, 0.12)",
        "2xl": "0 25px 50px rgba(15, 23, 42, 0.12)",
        "inner-border": "inset 0px -2px 0px 0px #1E293B",
      },
      zIndex: {
        60: "60",
      },
      minHeight: (theme) => ({
        ...theme("spacing"),
      }),
      backgroundImage: {
        "rainbow-gradient": `linear-gradient(90deg, ${colors.sky[300]}, ${colors.purple[700]}, ${colors.blue[500]}, ${colors.indigo[300]}, ${colors.sky[600]}, ${colors.blue[500]}, ${colors.purple[300]})`,
      },
      keyframes: {
        pulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 6px var(--pulse-color)" },
        },
        "opacity-pulse": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        "background-position-spin": {
          "0%": { backgroundPosition: "top center" },
          "100%": { backgroundPosition: "bottom center" },
        },
        "move-square": {
          "0%": {
            paddingLeft: "0",
            paddingTop: "0",
            paddingRight: "50%",
            paddingBottom: "50%",
          },
          "12.5%": {
            paddingLeft: "0",
            paddingTop: "0",
            paddingRight: "0",
            paddingBottom: "50%",
          },
          "25%": {
            paddingLeft: "50%",
            paddingTop: "0",
            paddingRight: "0",
            paddingBottom: "50%",
          },
          "37.5%": {
            paddingLeft: "50%",
            paddingTop: "0",
            paddingRight: "0",
            paddingBottom: "0",
          },
          "50%": {
            paddingLeft: "50%",
            paddingTop: "50%",
            paddingRight: "0",
            paddingBottom: "0",
          },
          "62.5%": {
            paddingLeft: "0",
            paddingTop: "50%",
            paddingRight: "0",
            paddingBottom: "0",
          },
          "75%": {
            paddingLeft: "0",
            paddingTop: "50%",
            paddingRight: "50%",
            paddingBottom: "0",
          },
          "87.5%": {
            paddingLeft: "0",
            paddingTop: "0",
            paddingRight: "50%",
            paddingBottom: "0",
          },
          "100%": {
            paddingLeft: "0",
            paddingTop: "0",
            paddingRight: "50%",
            paddingBottom: "50%",
          },
        },
        breathing: {
          "0%, 100%": {
            filter: "brightness(105%)",
          },
          "50%": {
            filter: "brightness(80%)",
          },
        },
        "breathing-scale": {
          "0%, 100%": {
            filter: "brightness(105%)",
            transform: "scale(1.0)",
          },
          "50%": {
            filter: "brightness(97%)",
            transform: "scale(0.95)",
          },
        },
        "cursor-blink": {
          "0%": {
            opacity: 1,
          },
          "90%": {
            opacity: 1,
          },
          "100%": {
            opacity: 0,
          },
        },
        "shiny-text": {
          "0%": {
            "background-position": "calc(-200%) 0",
          },
          "100%": {
            "background-position": "calc(200%) 0",
          },
        },
        rainbow: {
          "0%": { "background-position": "0%" },
          "100%": { "background-position": "200%" },
        },
      },
      animation: {
        "shiny-text": "shiny-text 2s infinite",
        pulse: "pulse var(--duration) ease-out infinite",
        "opacity-pulse": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "background-position-spin":
          "background-position-spin 2000ms infinite alternate",
        breathing: "breathing 3s infinite ease-in-out",
        "breathing-scale": "breathing-scale 3s infinite ease-in-out",
        "cursor-blink": "cursor-blink 0.9s infinite;",
        "move-square": "move-square 3s ease-out infinite",
        rainbow: "rainbow var(--speed, 6s) infinite linear",
      },
      colors: {
        brand: {
          DEFAULT: colors.emerald[500],
          dark: colors.emerald[500],
        },
        border: {
          DEFAULT: { DEFAULT: colors.slate[100], dark: colors.slate[900] },
          dark: { DEFAULT: colors.slate[200], dark: colors.slate[800] },
          darker: { DEFAULT: colors.slate[400], dark: colors.slate[6800] },
          focus: {
            DEFAULT: colors.slate[400],
            dark: colors.slate[600],
          },
          warning: {
            DEFAULT: colors.slate[200],
            dark: colors.slate[800],
          },
        },
        separator: { DEFAULT: colors.slate[200], dark: colors.slate[800] },
        ring: {
          DEFAULT: colors.blue[300],
          dark: colors.slate[700],
          warning: {
            DEFAULT: colors.red[300],
            dark: colors.red[700],
          },
        },
        background: { DEFAULT: colors.white, dark: colors.slate[950] },
        foreground: {
          DEFAULT: colors.slate[950],
          dark: colors.white,
          warning: {
            DEFAULT: colors.red[500],
            dark: colors.red[500],
          },
        },
        muted: {
          DEFAULT: { DEFAULT: colors.slate[100], dark: colors.slate[900] },
          foreground: {
            DEFAULT: colors.slate[500],
            dark: colors.slate[500],
          },
          background: {
            DEFAULT: "#F6F8FB",
            dark: colors.slate[900],
          },
        },
        highlight: {
          DEFAULT: colors.blue[500],
          light: { DEFAULT: colors.blue[400], dark: colors.blue[600] },
          dark: { DEFAULT: colors.blue[600], dark: colors.blue[400] },
          muted: { DEFAULT: "#AFCDEF", dark: "#284896" },
          950: { DEFAULT: colors.blue[950], dark: colors.blue[50] },
          900: { DEFAULT: colors.blue[900], dark: colors.blue[100] },
          800: { DEFAULT: colors.blue[800], dark: colors.blue[200] },
          700: { DEFAULT: colors.blue[700], dark: colors.blue[300] },
          600: { DEFAULT: colors.blue[600], dark: colors.blue[400] },
          500: colors.blue[500],
          400: { DEFAULT: colors.blue[400], dark: colors.blue[600] },
          300: { DEFAULT: colors.blue[300], dark: colors.blue[700] },
          200: { DEFAULT: colors.blue[200], dark: colors.blue[800] },
          100: { DEFAULT: colors.blue[100], dark: colors.blue[900] },
          50: { DEFAULT: colors.blue[50], dark: colors.blue[950] },
        },
        primary: {
          DEFAULT: colors.slate[800],
          light: { DEFAULT: colors.slate[600], dark: colors.slate[300] },
          dark: { DEFAULT: colors.slate[950], dark: colors.slate[50] },
          muted: { DEFAULT: colors.slate[400], dark: colors.slate[600] },
          950: { DEFAULT: colors.slate[950], dark: colors.slate[50] },
          900: { DEFAULT: colors.slate[900], dark: colors.slate[100] },
          800: { DEFAULT: colors.slate[800], dark: colors.slate[200] },
          700: { DEFAULT: colors.slate[700], dark: colors.slate[300] },
          600: { DEFAULT: colors.slate[600], dark: colors.slate[400] },
          500: { DEFAULT: colors.slate[500], dark: colors.slate[500] },
          400: { DEFAULT: colors.slate[400], dark: colors.slate[600] },
          300: { DEFAULT: colors.slate[300], dark: colors.slate[700] },
          200: { DEFAULT: colors.slate[200], dark: colors.slate[800] },
          150: { DEFAULT: "#E9EFF5", dark: "#172033" },
          100: { DEFAULT: colors.slate[100], dark: colors.slate[900] },
          50: { DEFAULT: "#F6F8FB", dark: colors.slate[950] },
        },
        warning: {
          DEFAULT: colors.red[500],
          light: { DEFAULT: colors.red[400], dark: colors.red[600] },
          dark: { DEFAULT: colors.red[600], dark: colors.red[400] },
          muted: { DEFAULT: "#E3BDC3", dark: "#762F39" },
          950: { DEFAULT: colors.red[950], dark: colors.red[50] },
          900: { DEFAULT: colors.red[900], dark: colors.red[100] },
          800: { DEFAULT: colors.red[800], dark: colors.red[200] },
          700: { DEFAULT: colors.red[700], dark: colors.red[300] },
          600: { DEFAULT: colors.red[600], dark: colors.red[400] },
          500: { DEFAULT: colors.red[500], dark: colors.red[500] },
          400: { DEFAULT: colors.red[400], dark: colors.red[600] },
          200: { DEFAULT: colors.red[200], dark: colors.red[800] },
          300: { DEFAULT: colors.red[300], dark: colors.red[700] },
          100: { DEFAULT: colors.red[100], dark: colors.red[900] },
          50: { DEFAULT: colors.red[50], dark: colors.red[950] },
        },
        success: {
          DEFAULT: colors.emerald[500],
          light: { DEFAULT: colors.emerald[400], dark: colors.emerald[600] },
          dark: { DEFAULT: colors.emerald[600], dark: colors.emerald[400] },
          muted: { DEFAULT: "#9CDECC", dark: "#1C5D56" },
          500: { DEFAULT: colors.emerald[500], dark: colors.emerald[500] },
          400: { DEFAULT: colors.emerald[400], dark: colors.emerald[600] },
          200: { DEFAULT: colors.emerald[200], dark: colors.emerald[800] },
          300: { DEFAULT: colors.emerald[300], dark: colors.emerald[700] },
          100: { DEFAULT: colors.emerald[100], dark: colors.emerald[900] },
          600: { DEFAULT: colors.emerald[600], dark: colors.emerald[400] },
          700: { DEFAULT: colors.emerald[700], dark: colors.emerald[300] },
          800: { DEFAULT: colors.emerald[800], dark: colors.emerald[200] },
          900: { DEFAULT: colors.emerald[900], dark: colors.emerald[100] },
          950: { DEFAULT: colors.emerald[950], dark: colors.emerald[50] },
          50: { DEFAULT: colors.emerald[50], dark: colors.emerald[950] },
        },
        action: {
          950: { DEFAULT: colors.blue[950], dark: colors.blue[50] },
          900: { DEFAULT: colors.blue[900], dark: colors.blue[100] },
          800: { DEFAULT: colors.blue[800], dark: colors.blue[200] },
          700: { DEFAULT: colors.blue[700], dark: colors.blue[300] },
          600: { DEFAULT: colors.blue[600], dark: colors.blue[400] },
          500: { DEFAULT: colors.blue[500], dark: colors.blue[500] },
          400: { DEFAULT: colors.blue[400], dark: colors.blue[600] },
          300: { DEFAULT: colors.blue[300], dark: colors.blue[700] },
          200: { DEFAULT: colors.blue[200], dark: colors.blue[800] },
          100: { DEFAULT: colors.blue[100], dark: colors.blue[900] },
          50: { DEFAULT: colors.blue[50], dark: colors.blue[950] },
        },
        structure: {
          0: { DEFAULT: colors.white, dark: colors.black },
          50: { DEFAULT: "#F6F8FB", dark: colors.slate[900] },
          100: { DEFAULT: colors.slate[100], dark: colors.slate[800] },
          150: { DEFAULT: "#E9EFF5", dark: "#172033" },
          200: { DEFAULT: colors.slate[200], dark: colors.slate[700] },
          300: { DEFAULT: colors.slate[300], dark: colors.slate[600] },
        },
        element: {
          950: { DEFAULT: colors.slate[950], dark: colors.slate[50] },
          900: { DEFAULT: colors.slate[900], dark: colors.slate[100] },
          800: { DEFAULT: colors.slate[700], dark: colors.slate[200] },
          700: { DEFAULT: colors.slate[500], dark: colors.slate[300] },
          600: { DEFAULT: colors.slate[400], dark: colors.slate[400] },
          500: { DEFAULT: colors.slate[300], dark: colors.slate[500] },
        },
      },
    },
  },
  darkMode: "class",
  variants: {
    extend: {
      backgroundColor: ["dark"],
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("tailwind-scrollbar-hide"),
    require("tailwindcss-animate"),
  ],
  prefix: "s-",
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  safelist: [
    ...safeColorlist,
    "s-grid-rows-2",
    "s-grid-rows-3",
    "s-grid-rows-4",
    "s-grid-rows-5",
  ],
};
