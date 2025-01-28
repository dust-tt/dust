/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors"); // eslint-disable-line @typescript-eslint/no-var-requires

module.exports = {
  theme: {
    screens: {
      xxs: "384px",
      xs: "512px",
      sm: "640px",
      md: "768px",
      lg: "1024px",
      xl: "1280px",
      "2xl": "1536px",
    },
    fontFamily: {
      sans: ["'darkmode-off-cc'", "sans-serif"],
      objektiv: ["'objektiv-mk1'", "sans-serif"],
    },
    extend: {
      borderRadius: {
        "4xl": "2rem",
      },
      maxWidth: {
        48: "12rem",
      },
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
        tale: "0px 0px 12px 12px #F6F8FB",
        "tale-white": "0px 0px 12px 12px #FFF",
        "tale-darkMode": "0px 0px 12px 12px #172033",
      },
      zIndex: {
        60: "60",
      },
      minWidth: (theme) => ({
        ...theme("spacing"),
      }),
      minHeight: (theme) => ({
        ...theme("spacing"),
      }),
      keyframes: {
        appear: {
          "0%": { opacity: "0", width: "0" },
          "100%": { opacity: "1", width: "320px" },
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
        transitionProperty: {
          width: "width",
        },
        fadeout: {
          "0%": {
            opacity: "1",
          },
          "100%": {
            opacity: "0",
          },
        },
        reload: {
          "0%, 100%": {
            transform: "scale(1)",
            opacity: "1",
          },
          "50%": {
            transform: "scale(0.99)",
            opacity: "0.4",
          },
        },
      },
      animation: {
        "move-square": "move-square 4s ease-out infinite",
        breathing: "breathing 4s infinite ease-in-out",
        "breathing-scale": "breathing-scale 3s infinite ease-in-out",
        "cursor-blink": "cursor-blink 0.9s infinite;",
        shake: "shake 0.82s cubic-bezier(.36,.07,.19,.97) both",
        reload: "reload 1000ms ease-out",
        fadeout: "fadeout 500ms ease-out",
      },
      colors: {
        brand: {
          DEFAULT: colors.emerald[500],
          dark: colors.emerald[500],
        },
        border: {
          DEFAULT: { DEFAULT: colors.slate[100], darkMode: colors.slate[900] },
          dark: { DEFAULT: colors.slate[200], darkMode: colors.slate[800] },
          darker: { DEFAULT: colors.slate[400], darkMode: colors.slate[6800] },
          focus: {
            DEFAULT: colors.slate[400],
            darkMode: colors.slate[600],
          },
          warning: {
            DEFAULT: colors.red[200],
            darkMode: colors.red[800],
          },
        },
        separator: { DEFAULT: colors.slate[200], darkMode: colors.slate[800] },
        ring: {
          DEFAULT: colors.blue[300],
          darkMode: colors.slate[700],
          warning: {
            DEFAULT: colors.red[300],
            dadarkModerk: colors.red[700],
          },
        },
        background: { DEFAULT: colors.white, darkMode: colors.slate[950] },
        foreground: {
          DEFAULT: colors.slate[950],
          dark: colors.white,
          warning: {
            DEFAULT: colors.red[500],
            darkMode: colors.red[500],
          },
        },
        muted: {
          DEFAULT: { DEFAULT: colors.slate[100], darkMode: colors.slate[900] },
          foreground: {
            DEFAULT: colors.slate[500],
            darkMode: colors.slate[500],
          },
          background: {
            DEFAULT: "#F6F8FB",
            darkMode: colors.slate[900],
          },
        },
        highlight: {
          DEFAULT: colors.blue[500],
          light: { DEFAULT: colors.blue[400], darkMode: colors.blue[600] },
          dark: { DEFAULT: colors.blue[600], darkMode: colors.blue[400] },
          muted: { DEFAULT: "#AFCDEF", darkMode: "#284896" },
          950: { DEFAULT: colors.blue[950], darkMode: colors.blue[50] },
          900: { DEFAULT: colors.blue[900], darkMode: colors.blue[100] },
          800: { DEFAULT: colors.blue[800], darkMode: colors.blue[200] },
          700: { DEFAULT: colors.blue[700], darkMode: colors.blue[300] },
          600: { DEFAULT: colors.blue[600], darkMode: colors.blue[400] },
          500: colors.blue[500],
          400: { DEFAULT: colors.blue[400], darkMode: colors.blue[600] },
          300: { DEFAULT: colors.blue[300], darkMode: colors.blue[700] },
          200: { DEFAULT: colors.blue[200], darkMode: colors.blue[800] },
          100: { DEFAULT: colors.blue[100], darkMode: colors.blue[900] },
          50: { DEFAULT: colors.blue[50], darkMode: colors.blue[950] },
        },
        primary: {
          DEFAULT: colors.slate[800],
          light: { DEFAULT: colors.slate[700], darkMode: colors.slate[300] },
          dark: { DEFAULT: colors.slate[950], darkMode: "#F6F8FB" },
          muted: { DEFAULT: colors.slate[400], darkMode: colors.slate[600] },
          950: { DEFAULT: colors.slate[950], darkMode: "#F6F8FB" },
          900: { DEFAULT: colors.slate[900], darkMode: colors.slate[100] },
          800: { DEFAULT: colors.slate[800], darkMode: colors.slate[200] },
          700: { DEFAULT: colors.slate[700], darkMode: colors.slate[300] },
          600: { DEFAULT: colors.slate[600], darkMode: colors.slate[400] },
          500: { DEFAULT: colors.slate[500], darkMode: colors.slate[500] },
          400: { DEFAULT: colors.slate[400], darkMode: colors.slate[600] },
          300: { DEFAULT: colors.slate[300], darkMode: colors.slate[700] },
          200: { DEFAULT: colors.slate[200], darkMode: colors.slate[800] },
          150: { DEFAULT: "#E9EFF5", darkMode: "#172033" },
          100: { DEFAULT: colors.slate[100], darkMode: colors.slate[900] },
          50: { DEFAULT: "#F6F8FB", dark: colors.slate[950] },
        },
        warning: {
          DEFAULT: colors.red[500],
          light: { DEFAULT: colors.red[400], darkMode: colors.red[600] },
          dark: { DEFAULT: colors.red[600], darkMode: colors.red[400] },
          muted: { DEFAULT: "#E3BDC3", darkMode: "#762F39" },
          950: { DEFAULT: colors.red[950], darkMode: colors.red[50] },
          900: { DEFAULT: colors.red[900], darkMode: colors.red[100] },
          800: { DEFAULT: colors.red[800], darkMode: colors.red[200] },
          700: { DEFAULT: colors.red[700], darkMode: colors.red[300] },
          600: { DEFAULT: colors.red[600], darkMode: colors.red[400] },
          500: { DEFAULT: colors.red[500], darkMode: colors.red[500] },
          400: { DEFAULT: colors.red[400], darkMode: colors.red[600] },
          200: { DEFAULT: colors.red[200], darkMode: colors.red[800] },
          300: { DEFAULT: colors.red[300], darkMode: colors.red[700] },
          100: { DEFAULT: colors.red[100], darkMode: colors.red[900] },
          50: { DEFAULT: colors.red[50], darkMode: colors.red[950] },
        },
        success: {
          DEFAULT: colors.emerald[500],
          light: {
            DEFAULT: colors.emerald[400],
            darkMode: colors.emerald[600],
          },
          dark: { DEFAULT: colors.emerald[600], darkMode: colors.emerald[400] },
          muted: { DEFAULT: "#9CDECC", darkMode: "#1C5D56" },
          500: { DEFAULT: colors.emerald[500], darkMode: colors.emerald[500] },
          400: { DEFAULT: colors.emerald[400], darkMode: colors.emerald[600] },
          200: { DEFAULT: colors.emerald[200], darkMode: colors.emerald[800] },
          300: { DEFAULT: colors.emerald[300], darkMode: colors.emerald[700] },
          100: { DEFAULT: colors.emerald[100], darkMode: colors.emerald[900] },
          600: { DEFAULT: colors.emerald[600], darkMode: colors.emerald[400] },
          700: { DEFAULT: colors.emerald[700], darkMode: colors.emerald[300] },
          800: { DEFAULT: colors.emerald[800], darkMode: colors.emerald[200] },
          900: { DEFAULT: colors.emerald[900], darkMode: colors.emerald[100] },
          950: { DEFAULT: colors.emerald[950], darkMode: colors.emerald[50] },
          50: { DEFAULT: colors.emerald[50], darkMode: colors.emerald[950] },
        },
        action: {
          950: { DEFAULT: colors.blue[950], darkMode: colors.blue[50] },
          900: { DEFAULT: colors.blue[900], darkMode: colors.blue[100] },
          800: { DEFAULT: colors.blue[800], darkMode: colors.blue[200] },
          700: { DEFAULT: colors.blue[700], darkMode: colors.blue[300] },
          600: { DEFAULT: colors.blue[600], darkMode: colors.blue[400] },
          500: { DEFAULT: colors.blue[500], darkMode: colors.blue[500] },
          400: { DEFAULT: colors.blue[400], darkMode: colors.blue[600] },
          300: { DEFAULT: colors.blue[300], darkMode: colors.blue[700] },
          200: { DEFAULT: colors.blue[200], darkMode: colors.blue[800] },
          100: { DEFAULT: colors.blue[100], darkMode: colors.blue[900] },
          50: { DEFAULT: colors.blue[50], darkMode: colors.blue[950] },
        },
        structure: {
          0: { DEFAULT: colors.white, darkMode: colors.black },
          50: { DEFAULT: "#F6F8FB", darkMode: colors.slate[900] },
          100: { DEFAULT: colors.slate[100], darkMode: colors.slate[800] },
          150: { DEFAULT: "#E9EFF5", darkMode: "#172033" },
          200: { DEFAULT: colors.slate[200], darkMode: colors.slate[700] },
          300: { DEFAULT: colors.slate[300], darkMode: colors.slate[600] },
        },
        element: {
          950: { DEFAULT: colors.slate[950], darkMode: "#F6F8FB" },
          900: { DEFAULT: colors.slate[900], darkMode: colors.slate[100] },
          800: { DEFAULT: colors.slate[700], darkMode: colors.slate[200] },
          700: { DEFAULT: colors.slate[500], darkMode: colors.slate[300] },
          600: { DEFAULT: colors.slate[400], darkMode: colors.slate[400] },
          500: { DEFAULT: colors.slate[300], darkMode: colors.slate[500] },
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
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      pattern: /^bg-/,
    },
    {
      pattern: /^grid-rows-/,
    },
  ],
};
