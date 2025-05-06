import type { Config } from "tailwindcss";
const colors = require("tailwindcss/colors"); // eslint-disable-line @typescript-eslint/no-var-requires

// Custom color definitions
const customColors = {
  gray: {
    950: "#0E1219",
    900: "#232932",
    800: "#2D3543",
    700: "#364153",
    600: "#586170",
    500: "#7B818D",
    400: "#969CA5",
    300: "#B2B6BD",
    200: "#D3D5D9",
    150: "#DFE0E2",
    100: "#EEEEEF",
    50: "#F7F7F7",
  },
  golden: {
    950: "#331606",
    900: "#70350C",
    800: "#AF5511",
    700: "#E27716",
    600: "#FE9C1A",
    500: "#FFAA0D",
    400: "#FFBE2C",
    300: "#FFD046",
    200: "#FFE262",
    100: "#FFEFA8",
    50: "#FFFAE0",
  },
  blue: {
    950: "#041728",
    900: "#07355F",
    800: "#085092",
    700: "#0A6CC6",
    600: "#137FE3",
    500: "#1C91FF",
    400: "#4BABFF",
    300: "#7AC6FF",
    200: "#9FDBFF",
    100: "#CAEBFF",
    50: "#E9F7FF",
  },
  green: {
    950: "#04140A",
    900: "#0A361A",
    800: "#105B2B",
    700: "#277644",
    600: "#418B5C",
    500: "#6AA668",
    400: "#91C174",
    300: "#BCDE81",
    200: "#E2F78C",
    100: "#F0FBBD",
    50: "#FEFFF0",
  },
  rose: {
    950: "#220A04",
    900: "#571609",
    800: "#8C230D",
    700: "#B22E13",
    600: "#C93913",
    500: "#E14322",
    400: "#ED756C",
    300: "#F8A6B4",
    200: "#FFC3DF",
    100: "#FFDCEC",
    50: "#FFF1F7",
  },
};

// Get all color names from Tailwind's default palette, excluding special colors
const colorNames = Object.keys(colors).filter(
  (color) =>
    typeof colors[color] === "object" &&
    !["transparent", "current", "inherit", "white", "black"].includes(color)
);

const config: Config = {
  content: [
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    fontFamily: {
      sans: ["Geist", "sans-serif"],
      mono: ["Geist Mono", "monospace"],
    },
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        // Creates night shades for all colors
        ...Object.fromEntries(
          colorNames.map((colorName) => [
            colorName,
            Object.fromEntries(
              Object.entries(colors[colorName]).map(([shade]) => [
                `${shade}-night`,
                colors[colorName][Math.min(950, 1000 - parseInt(shade))],
              ])
            ),
          ])
        ),
        // Additional palette colors
        golden: {
          950: {
            DEFAULT: customColors.golden[950],
            night: customColors.golden[50],
          },
          900: {
            DEFAULT: customColors.golden[900],
            night: customColors.golden[100],
          },
          800: {
            DEFAULT: customColors.golden[800],
            night: customColors.golden[200],
          },
          700: {
            DEFAULT: customColors.golden[700],
            night: customColors.golden[300],
          },
          600: {
            DEFAULT: customColors.golden[600],
            night: customColors.golden[400],
          },
          500: {
            DEFAULT: customColors.golden[500],
            night: customColors.golden[500],
          },
          400: {
            DEFAULT: customColors.golden[400],
            night: customColors.golden[600],
          },
          300: {
            DEFAULT: customColors.golden[300],
            night: customColors.golden[700],
          },
          200: {
            DEFAULT: customColors.golden[200],
            night: customColors.golden[800],
          },
          100: {
            DEFAULT: customColors.golden[100],
            night: customColors.golden[900],
          },
          50: {
            DEFAULT: customColors.golden[50],
            night: customColors.golden[950],
          },
        },
        // Brand colors
        brand: {
          DEFAULT: colors.green[600],
          "hunter-green": colors.green[600],
          "tea-green": colors.green[200],
          "support-green": colors.green[50],
          "electric-blue": colors.blue[500],
          "sky-blue": colors.blue[200],
          "support-blue": colors.blue[50],
          "red-rose": colors.red[500],
          "pink-rose": colors.red[200],
          "support-rose": colors.red[50],
          "orange-golden": customColors.golden[600],
          "sunshine-golden": customColors.golden[200],
          "support-golden": customColors.golden[50],
          "dark-gray": colors.gray[700],
          "light-gray": colors.gray[200],
          "support-gray": colors.gray[50],
        },
        // Semantic Colors
        border: {
          DEFAULT: colors.gray[100],
          night: colors.gray[800],
          dark: {
            DEFAULT: colors.gray[100],
            night: colors.gray[900],
          },
          // DARKER must become DARK, then NEEDS TO BE REMOVED
          darker: {
            DEFAULT: colors.gray[150],
            night: colors.gray[800],
          },
          focus: {
            DEFAULT: colors.blue[400],
            night: colors.gray[500],
          },
          warning: {
            DEFAULT: colors.rose[300],
            night: colors.rose[800],
          },
        },
        separator: { DEFAULT: colors.gray[100], night: colors.gray[800] },
        ring: {
          DEFAULT: colors.blue[200],
          night: colors.gray[700],
          warning: {
            DEFAULT: colors.rose[300],
            night: colors.rose[800],
          },
        },
        background: { DEFAULT: colors.white, night: colors.black },
        foreground: {
          DEFAULT: colors.gray[950],
          night: colors.gray[50],
          warning: {
            DEFAULT: colors.rose[500],
            night: colors.rose[500],
          },
        },
        muted: {
          DEFAULT: colors.gray[50],
          night: colors.gray[950],
          foreground: {
            DEFAULT: colors.gray[600],
            night: colors.gray[400],
          },
          background: {
            DEFAULT: colors.gray[50],
            night: colors.gray[950],
          },
        },
        // Semantic Palette
        primary: {
          DEFAULT: colors.gray[800],
          night: colors.gray[200],
          light: { DEFAULT: colors.gray[600], night: colors.gray[300] },
          dark: { DEFAULT: colors.gray[950], night: colors.gray[100] },
          muted: { DEFAULT: colors.gray[400], night: colors.gray[600] },
          950: { DEFAULT: colors.gray[950], night: colors.gray[100] },
          900: { DEFAULT: colors.gray[900], night: colors.gray[100] },
          800: { DEFAULT: colors.gray[800], night: colors.gray[200] },
          700: { DEFAULT: colors.gray[700], night: colors.gray[300] },
          600: { DEFAULT: colors.gray[600], night: colors.gray[400] },
          500: { DEFAULT: colors.gray[500], night: colors.gray[500] },
          400: { DEFAULT: colors.gray[400], night: colors.gray[600] },
          300: { DEFAULT: colors.gray[300], night: colors.gray[700] },
          200: { DEFAULT: colors.gray[200], night: colors.gray[800] },
          150: { DEFAULT: colors.gray[150], night: colors.gray[900] },
          100: { DEFAULT: colors.gray[100], night: colors.gray[900] },
          50: { DEFAULT: colors.gray[50], night: colors.gray[950] },
        },
        highlight: {
          DEFAULT: colors.blue[500],
          night: colors.blue[500],
          light: { DEFAULT: colors.blue[400], night: colors.blue[600] },
          dark: { DEFAULT: colors.blue[600], night: colors.blue[400] },
          muted: { DEFAULT: "#8EB2D3", night: "#8EB2D3" },
          950: { DEFAULT: colors.blue[950], night: colors.blue[50] },
          900: { DEFAULT: colors.blue[900], night: colors.blue[100] },
          800: { DEFAULT: colors.blue[800], night: colors.blue[200] },
          700: { DEFAULT: colors.blue[700], night: colors.blue[300] },
          600: { DEFAULT: colors.blue[600], night: colors.blue[400] },
          500: { DEFAULT: colors.blue[500], night: colors.blue[500] },
          400: { DEFAULT: colors.blue[400], night: colors.blue[600] },
          300: { DEFAULT: colors.blue[300], night: colors.blue[700] },
          200: { DEFAULT: colors.blue[200], night: colors.blue[800] },
          100: { DEFAULT: colors.blue[100], night: colors.blue[900] },
          50: { DEFAULT: colors.blue[50], night: colors.blue[950] },
        },
        warning: {
          DEFAULT: colors.rose[500],
          light: { DEFAULT: colors.rose[400], night: colors.rose[600] },
          dark: { DEFAULT: colors.rose[600], night: colors.rose[400] },
          muted: { DEFAULT: "#D5AAA1", night: "#D5AAA1" },
          950: { DEFAULT: colors.rose[950], night: colors.rose[50] },
          900: { DEFAULT: colors.rose[900], night: colors.rose[100] },
          800: { DEFAULT: colors.rose[800], night: colors.rose[200] },
          700: { DEFAULT: colors.rose[700], night: colors.rose[300] },
          600: { DEFAULT: colors.rose[600], night: colors.rose[400] },
          500: { DEFAULT: colors.rose[500], night: colors.rose[500] },
          400: { DEFAULT: colors.rose[400], night: colors.rose[600] },
          200: { DEFAULT: colors.rose[200], night: colors.rose[800] },
          300: { DEFAULT: colors.rose[300], night: colors.rose[700] },
          100: { DEFAULT: colors.rose[100], night: colors.rose[900] },
          50: { DEFAULT: colors.rose[50], night: colors.rose[950] },
        },
        success: {
          DEFAULT: colors.green[500],
          light: { DEFAULT: colors.green[400], night: colors.green[600] },
          dark: { DEFAULT: colors.green[600], night: colors.green[400] },
          muted: { DEFAULT: "#A9B8A9", night: "#A9B8A9" },
          500: { DEFAULT: colors.green[500], night: colors.green[500] },
          400: { DEFAULT: colors.green[400], night: colors.green[600] },
          200: { DEFAULT: colors.green[200], night: colors.green[800] },
          300: { DEFAULT: colors.green[300], night: colors.green[700] },
          100: { DEFAULT: colors.green[100], night: colors.green[900] },
          600: { DEFAULT: colors.green[600], night: colors.green[400] },
          700: { DEFAULT: colors.green[700], night: colors.green[300] },
          800: { DEFAULT: colors.green[800], night: colors.green[200] },
          900: { DEFAULT: colors.green[900], night: colors.green[100] },
          950: { DEFAULT: colors.green[950], night: colors.green[50] },
          50: { DEFAULT: colors.green[50], night: colors.green[950] },
        },
        info: {
          DEFAULT: customColors.golden[500],
          light: {
            DEFAULT: customColors.golden[400],
            night: customColors.golden[600],
          },
          dark: {
            DEFAULT: customColors.golden[600],
            night: customColors.golden[400],
          },
          muted: { DEFAULT: "#E1C99B", night: "#E1C99B" },
          500: {
            DEFAULT: customColors.golden[500],
            night: customColors.golden[500],
          },
          400: {
            DEFAULT: customColors.golden[400],
            night: customColors.golden[600],
          },
          200: {
            DEFAULT: customColors.golden[200],
            night: customColors.golden[800],
          },
          300: {
            DEFAULT: customColors.golden[300],
            night: customColors.golden[700],
          },
          100: {
            DEFAULT: customColors.golden[100],
            night: customColors.golden[900],
          },
          600: {
            DEFAULT: customColors.golden[600],
            night: customColors.golden[400],
          },
          700: {
            DEFAULT: customColors.golden[700],
            night: customColors.golden[300],
          },
          800: {
            DEFAULT: customColors.golden[800],
            night: customColors.golden[200],
          },
          900: {
            DEFAULT: customColors.golden[900],
            night: customColors.golden[100],
          },
          950: {
            DEFAULT: customColors.golden[950],
            night: customColors.golden[50],
          },
          50: {
            DEFAULT: customColors.golden[50],
            night: customColors.golden[950],
          },
        },
      },
    },
  },
  plugins: [],
  safelist: [
    {
      pattern: /./, // This matches all class names.
    },
  ],
};
export default config;
