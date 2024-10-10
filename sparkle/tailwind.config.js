/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");

const safeColorsArray = [
  "action",
  "amber",
  "blue",
  "cyan",
  "emerald",
  "emerald",
  "fuchsia",
  "gray",
  "green",
  "indigo",
  "lime",
  "orange",
  "pink",
  "pink",
  "purple",
  "purple",
  "red",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
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
      },
      zIndex: {
        60: "60",
      },
      minHeight: (theme) => ({
        ...theme("spacing"),
      }),
      keyframes: {
        pulse: {
          "0%, 100%": { boxShadow: "0 0 0 0 var(--pulse-color)" },
          "50%": { boxShadow: "0 0 0 6px var(--pulse-color)" },
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
      },
      animation: {
        pulse: "pulse var(--duration) ease-out infinite",
        "background-position-spin":
          "background-position-spin 2000ms infinite alternate",
        breathing: "breathing 3s infinite ease-in-out",
        "breathing-scale": "breathing-scale 3s infinite ease-in-out",
        "move-square": "move-square 3s ease-out infinite",
      },
      colors: {
        separator: {
          DEFAULT: colors.slate[200],
          dark: colors.slate[800]
        },
        border: {
          DEFAULT: colors.slate[100],
          dark: colors.slate[900],
        },
        "border-dark": {
          DEFAULT: colors.slate[200],
          dark: colors.slate[800],
        },
        background: {
          DEFAULT: colors.white,
          dark: colors.slate[950]
        },
        foreground: {
          DEFAULT: colors.slate[950],
          dark: colors.white
        },
        muted: {
          DEFAULT: colors.slate[50],
          dark: colors.slate[900]
        },
        "muted-foreground": {
          DEFAULT: colors.slate[500],
          dark: colors.slate[500],
        },
        brand: {
          DEFAULT: colors.emerald[500],
          dark: colors.emerald[500],
        },
        highlight: {
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
        primary: {
          950: { DEFAULT: colors.slate[950], dark: colors.slate[50] },
          900: { DEFAULT: colors.slate[900], dark: colors.slate[100] },
          800: { DEFAULT: colors.slate[800], dark: colors.slate[200] },
          700: { DEFAULT: colors.slate[700], dark: colors.slate[300] },
          600: { DEFAULT: colors.slate[600], dark: colors.slate[400] },
          500: { DEFAULT: colors.slate[500], dark: colors.slate[500] },
          400: { DEFAULT: colors.slate[400], dark: colors.slate[600] },
          300: { DEFAULT: colors.slate[300], dark: colors.slate[700] },
          200: { DEFAULT: colors.slate[200], dark: colors.slate[800] },
          100: { DEFAULT: colors.slate[100], dark: colors.slate[900] },
          50: { DEFAULT: colors.slate[50], dark: colors.slate[950] },
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
        warning: {
          500: { DEFAULT: colors.red[500], dark: colors.red[500] },
          400: { DEFAULT: colors.red[400], dark: colors.red[600] },
          200: { DEFAULT: colors.red[200], dark: colors.red[800] },
          300: { DEFAULT: colors.red[300], dark: colors.red[700] },
          100: { DEFAULT: colors.red[100], dark: colors.red[900] },
          600: { DEFAULT: colors.red[600], dark: colors.red[400] },
          700: { DEFAULT: colors.red[700], dark: colors.red[300] },
          800: { DEFAULT: colors.red[800], dark: colors.red[200] },
          900: { DEFAULT: colors.red[900], dark: colors.red[100] },
          950: { DEFAULT: colors.red[950], dark: colors.red[50] },
          50: { DEFAULT: colors.red[50], dark: colors.red[950] },
        },
        red: {
          500: { DEFAULT: colors.red[500], dark: colors.red[500] },
          400: { DEFAULT: colors.red[400], dark: colors.red[600] },
          200: { DEFAULT: colors.red[200], dark: colors.red[800] },
          300: { DEFAULT: colors.red[300], dark: colors.red[700] },
          100: { DEFAULT: colors.red[100], dark: colors.red[900] },
          600: { DEFAULT: colors.red[600], dark: colors.red[400] },
          700: { DEFAULT: colors.red[700], dark: colors.red[300] },
          800: { DEFAULT: colors.red[800], dark: colors.red[200] },
          900: { DEFAULT: colors.red[900], dark: colors.red[100] },
          950: { DEFAULT: colors.red[950], dark: colors.red[50] },
          50: { DEFAULT: colors.red[50], dark: colors.red[950] },
        },
        success: {
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
        structure: {
          0: { DEFAULT: colors.white, dark: colors.black },
          50: { DEFAULT: colors.slate[50], dark: colors.slate[900] },
          100: { DEFAULT: colors.slate[100], dark: colors.slate[800] },
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
