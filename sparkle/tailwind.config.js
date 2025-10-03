/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");
const plugin = require("tailwindcss/plugin");

// Remove unused deprecated colors that just generate noise
// See here for the hack: https://github.com/tailwindlabs/tailwindcss/discussions/15127
delete colors.lightBlue;
delete colors.warmGray;
delete colors.trueGray;
delete colors.coolGray;
delete colors.blueGray;

const safeColorsArray = [
  "gray",
  "green",
  "rose",
  "golden",
  "blue",
  "primary",
  "highlight",
  "success",
  "warning",
  "info",
  "emerald",
  "lime",
  "orange",
  "pink",
  "red",
  "violet",
];

// Get all color names from Tailwind's default palette, excluding special colors
const colorNames = Object.keys(colors).filter(
  (color) =>
    typeof colors[color] === "object" &&
    !["transparent", "current", "inherit", "white", "black"].includes(color)
);

// Custom color definitions
const customColors = {
  gray: {
    950: "#111418",
    900: "#1C222D",
    850: "#232A37",
    800: "#2A3241",
    700: "#364153",
    600: "#545D6C",
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
  violet: {
    950: "#2E1065",
    900: "#4C1D95",
    800: "#5B21B6",
    700: "#6D28D9",
    600: "#7C3AED",
    500: "#8B5CF6",
    400: "#A78BFA",
    300: "#C4B5FD",
    200: "#DDD6FE",
    100: "#EDE9FE",
    50: "#F5F3FF",
  },
  red: {
    950: "#220A04",
    900: "#571609",
    800: "#8C230D",
    700: "#B22E13",
    600: "#C9391A",
    500: "#E14322",
    400: "#E76449",
    300: "#EC8874",
    200: "#F2AD9F",
    100: "#F8CEC7",
    50: "#FEF2F2",
  },
  orange: {
    950: "#431407",
    900: "#7C2D12",
    800: "#9A3412",
    700: "#C2410C",
    600: "#EA580C",
    500: "#F97316",
    400: "#FB923C",
    300: "#FDBA74",
    200: "#FED7AA",
    100: "#FFEDD5",
    50: "#FFF7ED",
  },
  lime: {
    950: "#172604",
    900: "#365314",
    800: "#3F6212",
    700: "#4D7C0F",
    600: "#65A30D",
    500: "#84CC16",
    400: "#A3E635",
    300: "#CCF16E",
    200: "#E2F78C",
    100: "#F0FBBD",
    50: "#FEFFF0",
  },
  emerald: {
    950: "#04140A",
    900: "#065F46",
    800: "#0A361A",
    700: "#277644",
    600: "#418B5C",
    500: "#54B47D",
    400: "#65DA9B",
    300: "#82EFB8",
    200: "#99FFCF",
    100: "#C2FEE2",
    50: "#ECFDF5",
  },
  pink: {
    950: "#39061A",
    900: "#841936",
    800: "#9E254A",
    700: "#B8315E",
    600: "#D13C72",
    500: "#EC4987",
    400: "#F373A5",
    300: "#F99BC3",
    200: "#FFC3DF",
    100: "#FFDCEC",
    50: "#FFF1F7",
  },
};

Object.assign(colors, {
  green: customColors.green,
  blue: customColors.blue,
  gray: customColors.gray,
  rose: customColors.rose,
  golden: customColors.golden,
  //For compatibility, to be removed after all direct color ref are edited for golden
  emerald: customColors.emerald,
  lime: customColors.lime,
  red: customColors.red,
  pink: customColors.pink,
  //to remove
  amber: customColors.golden,
  sky: customColors.blue,
});

const safeColorlist = safeColorsArray.flatMap((color) => [
  // Include 50 shade
  `s-bg-${color}-50`,
  // Whitelist all bg colors from shade 100 to 900
  ...Array.from({ length: 9 }, (_, i) => `s-bg-${color}-${(i + 1) * 100}`),
  // Include 950 shade
  `s-bg-${color}-950`,
  // Include muted shade
  `s-bg-${color}-muted`,
  // Add night mode variants
  `dark:s-bg-${color}-50-night`,
  ...Array.from(
    { length: 9 },
    (_, i) => `dark:s-bg-${color}-${(i + 1) * 100}-night`
  ),
  `dark:s-bg-${color}-950-night`,
  `s-border-${color}-100`,
  `s-border-${color}-200`,
  `s-border-${color}-300`,
  // Add night mode variants
  `dark:s-border-${color}-100-night`,
  `dark:s-border-${color}-200-night`,
  `dark:s-border-${color}-300-night`,
  `s-text-${color}-500`,
  `s-text-${color}-800`,
  `s-text-${color}-900`,
  `s-text-${color}-950`,
  // Add night mode variants
  `dark:s-text-${color}-500-night`,
  `dark:s-text-${color}-800-night`,
  `dark:s-text-${color}-900-night`,
  `dark:s-text-${color}-950-night`,
]);

module.exports = {
  future: {
    hoverOnlyWhenSupported: true,
  },
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
      sans: ["Geist", "sans-serif"],
      mono: ["Geist Mono", "monospace"],
    },
    fontSize: {
      xs: [
        "12px",
        {
          lineHeight: "16px",
          letterSpacing: "normal",
        },
      ],
      sm: [
        "14px",
        {
          lineHeight: "20px",
          letterSpacing: "-0.28px",
        },
      ],
      base: [
        "16px",
        {
          lineHeight: "24px",
          letterSpacing: "-0.32px",
        },
      ],
      lg: [
        "18px",
        {
          lineHeight: "26px",
          letterSpacing: "-0.36px",
        },
      ],
      xl: [
        "20px",
        {
          lineHeight: "28px",
          letterSpacing: "-0.4px",
        },
      ],
      "2xl": [
        "24px",
        {
          lineHeight: "30px",
          letterSpacing: "-0.96px",
        },
      ],
      "3xl": [
        "32px",
        {
          lineHeight: "36px",
          letterSpacing: "-1.28px",
        },
      ],
      "4xl": [
        "40px",
        {
          lineHeight: "42px",
          letterSpacing: "-2.4px",
        },
      ],
      "5xl": [
        "48px",
        {
          lineHeight: "52px",
          letterSpacing: "-2.88px",
        },
      ],
      "6xl": [
        "56px",
        {
          lineHeight: "60px",
          letterSpacing: "-3.36px",
        },
      ],
      "7xl": [
        "64px",
        {
          lineHeight: "68px",
          letterSpacing: "-3.84px",
        },
      ],
      "8xl": [
        "72px",
        {
          lineHeight: "76px",
          letterSpacing: "-4.32px",
        },
      ],
      "9xl": [
        "80px",
        {
          lineHeight: "84px",
          letterSpacing: "-4.8px",
        },
      ],
    },
    extend: {
      borderRadius: {
        "4xl": "2rem",
      },
      containers: {
        xxs: "24rem",
        xs: "32rem",
        sm: "40rem",
        md: "48rem",
        lg: "64rem",
        xl: "80rem",
      },
      scale: {
        99: ".99",
      },
      dropShadow: {
        DEFAULT: `0 2px 4px ${colors.gray[950]}10`,
        sm: `0 1px 2px ${colors.gray[950]}0D`,
        md: `0 4px 6px ${colors.gray[950]}1F`,
        lg: `0 10px 15px ${colors.gray[950]}1F`,
        xl: `0 20px 20px ${colors.gray[950]}1F`,
        "2xl": `0 25px 35px ${colors.gray[950]}1F`,
      },
      boxShadow: {
        DEFAULT: `0 2px 6px 0 ${colors.gray[950]}1A`,
        md: `0 4px 12px ${colors.gray[950]}1F`,
        lg: `0 10px 20px ${colors.gray[950]}1F`,
        xl: `0 20px 25px ${colors.gray[950]}1F`,
        "2xl": `0 25px 50px ${colors.gray[950]}1F`,
      },
      zIndex: {
        60: "60",
      },
      height: {
        100: "400px",
        125: "500px",
        150: "600px",
        175: "700px",
        // Semantic height classes matching dialog widths
        md: "448px",
        lg: "576px",
        xl: "768px",
        "2xl": "1024px",
      },
      minHeight: (theme) => ({
        ...theme("spacing"),
      }),
      backgroundImage: {
        "rainbow-gradient": `linear-gradient(90deg, ${colors.blue[300]}, ${colors.blue[500]}, ${colors.purple[500]}, ${colors.blue[400]}, ${colors.blue[700]})`,
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
          "60%": {
            opacity: 1,
          },
          "70%": {
            opacity: 0,
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
        "opacity-pulse": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "background-position-spin":
          "background-position-spin 2000ms infinite alternate",
        breathing: "breathing 3s infinite ease-in-out",
        "breathing-scale": "breathing-scale 3s infinite ease-in-out",
        "cursor-blink": "cursor-blink 0.9s infinite;",
        "move-square": "move-square 3s ease-out infinite",
        rainbow: "rainbow var(--speed, 16s) infinite linear",
        "collapse-down": "collapse-down 150ms ease-out",
        "collapse-up": "collapse-up 150ms ease-out",
      },
      colors: {
        // Creates night shades for all colors
        ...Object.fromEntries(
          colorNames.map((colorName) => [
            colorName,
            Object.fromEntries(
              Object.entries(colors[colorName]).map(([shade, color]) => [
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
            DEFAULT: colors.gray[150],
            night: colors.gray[700],
          },
          focus: {
            DEFAULT: colors.blue[400],
            night: colors.blue[600],
          },
          warning: {
            DEFAULT: colors.rose[200],
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
        background: { DEFAULT: colors.white, night: colors.gray[950] },
        foreground: {
          DEFAULT: colors.gray[950],
          night: colors.gray[200],
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
            night: colors.gray[900],
          },
        },
        faint: {
          DEFAULT: colors.gray[400],
          night: colors.gray[600],
        },
        // Semantic Palette
        primary: {
          DEFAULT: colors.gray[800],
          night: colors.gray[200],
          light: { DEFAULT: colors.gray[600], night: colors.gray[300] },
          dark: { DEFAULT: colors.gray[950], night: colors.gray[100] },
          muted: { DEFAULT: colors.gray[500], night: colors.gray[500] },
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
    require("@tailwindcss/container-queries"),
    plugin(function ({ addBase, theme }) {
      addBase({
        ".s-label-xs": {
          fontSize: theme("fontSize.xs[0]"),
          lineHeight: theme("fontSize.xs[1].lineHeight"),
          letterSpacing: theme("fontSize.xs[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-label-sm": {
          fontSize: theme("fontSize.sm[0]"),
          lineHeight: theme("fontSize.sm[1].lineHeight"),
          letterSpacing: theme("fontSize.sm[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-label-base": {
          fontSize: theme("fontSize.base[0]"),
          lineHeight: theme("fontSize.base[1].lineHeight"),
          letterSpacing: theme("fontSize.base[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-xs": {
          fontSize: theme("fontSize.xs[0]"),
          lineHeight: theme("fontSize.xs[1].lineHeight"),
          letterSpacing: theme("fontSize.xs[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-sm": {
          fontSize: theme("fontSize.sm[0]"),
          lineHeight: theme("fontSize.sm[1].lineHeight"),
          letterSpacing: theme("fontSize.sm[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-base": {
          fontSize: theme("fontSize.base[0]"),
          lineHeight: theme("fontSize.base[1].lineHeight"),
          letterSpacing: theme("fontSize.base[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-lg": {
          fontSize: theme("fontSize.lg[0]"),
          lineHeight: theme("fontSize.lg[1].lineHeight"),
          letterSpacing: theme("fontSize.lg[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-xl": {
          fontSize: theme("fontSize.xl[0]"),
          lineHeight: theme("fontSize.xl[1].lineHeight"),
          letterSpacing: theme("fontSize.xl[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-2xl": {
          fontSize: theme("fontSize.2xl[0]"),
          lineHeight: theme("fontSize.2xl[1].lineHeight"),
          letterSpacing: theme("fontSize.2xl[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-3xl": {
          fontSize: theme("fontSize.3xl[0]"),
          lineHeight: theme("fontSize.3xl[1].lineHeight"),
          letterSpacing: theme("fontSize.3xl[1].letterSpacing"),
          fontWeight: "600",
        },
        ".s-heading-4xl": {
          fontSize: theme("fontSize.4xl[0]"),
          lineHeight: theme("fontSize.4xl[1].lineHeight"),
          letterSpacing: theme("fontSize.4xl[1].letterSpacing"),
          fontWeight: "500",
        },
        ".s-heading-5xl": {
          fontSize: theme("fontSize.5xl[0]"),
          lineHeight: theme("fontSize.5xl[1].lineHeight"),
          letterSpacing: theme("fontSize.5xl[1].letterSpacing"),
          fontWeight: "500",
        },
        ".s-heading-6xl": {
          fontSize: theme("fontSize.6xl[0]"),
          lineHeight: theme("fontSize.6xl[1].lineHeight"),
          letterSpacing: theme("fontSize.6xl[1].letterSpacing"),
          fontWeight: "500",
        },
        ".s-heading-7xl": {
          fontSize: theme("fontSize.7xl[0]"),
          lineHeight: theme("fontSize.7xl[1].lineHeight"),
          letterSpacing: theme("fontSize.7xl[1].letterSpacing"),
          fontWeight: "500",
        },
        ".s-heading-8xl": {
          fontSize: theme("fontSize.8xl[0]"),
          lineHeight: theme("fontSize.8xl[1].lineHeight"),
          letterSpacing: theme("fontSize.8xl[1].letterSpacing"),
          fontWeight: "500",
        },
        ".s-heading-9xl": {
          fontSize: theme("fontSize.9xl[0]"),
          lineHeight: theme("fontSize.9xl[1].lineHeight"),
          letterSpacing: theme("fontSize.9xl[1].letterSpacing"),
          fontWeight: "500",
        },
        // Mono heading styles
        ".s-heading-mono-lg": {
          fontSize: theme("fontSize.lg[0]"),
          lineHeight: theme("fontSize.lg[1].lineHeight"),
          letterSpacing: theme("fontSize.lg[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-xl": {
          fontSize: theme("fontSize.xl[0]"),
          lineHeight: theme("fontSize.xl[1].lineHeight"),
          letterSpacing: theme("fontSize.xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-2xl": {
          fontSize: theme("fontSize.2xl[0]"),
          lineHeight: theme("fontSize.2xl[1].lineHeight"),
          letterSpacing: theme("fontSize.2xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-3xl": {
          fontSize: theme("fontSize.3xl[0]"),
          lineHeight: theme("fontSize.3xl[1].lineHeight"),
          letterSpacing: theme("fontSize.3xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-4xl": {
          fontSize: theme("fontSize.4xl[0]"),
          lineHeight: theme("fontSize.4xl[1].lineHeight"),
          letterSpacing: theme("fontSize.4xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-5xl": {
          fontSize: theme("fontSize.5xl[0]"),
          lineHeight: theme("fontSize.5xl[1].lineHeight"),
          letterSpacing: theme("fontSize.5xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-6xl": {
          fontSize: theme("fontSize.6xl[0]"),
          lineHeight: theme("fontSize.6xl[1].lineHeight"),
          letterSpacing: theme("fontSize.6xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-7xl": {
          fontSize: theme("fontSize.7xl[0]"),
          lineHeight: theme("fontSize.7xl[1].lineHeight"),
          letterSpacing: theme("fontSize.7xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-8xl": {
          fontSize: theme("fontSize.8xl[0]"),
          lineHeight: theme("fontSize.8xl[1].lineHeight"),
          letterSpacing: theme("fontSize.8xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-heading-mono-9xl": {
          fontSize: theme("fontSize.9xl[0]"),
          lineHeight: theme("fontSize.9xl[1].lineHeight"),
          letterSpacing: theme("fontSize.9xl[1].letterSpacing"),
          fontWeight: "400",
          fontFamily: theme("fontFamily.mono"),
        },
        ".s-copy-xs": {
          fontSize: theme("fontSize.xs[0]"),
          lineHeight: theme("fontSize.xs[1].lineHeight"),
          letterSpacing: theme("fontSize.xs[1].letterSpacing"),
          fontWeight: "400",
        },
        ".s-copy-sm": {
          fontSize: theme("fontSize.sm[0]"),
          lineHeight: theme("fontSize.sm[1].lineHeight"),
          letterSpacing: theme("fontSize.sm[1].letterSpacing"),
          fontWeight: "400",
        },
        ".s-copy-base": {
          fontSize: theme("fontSize.base[0]"),
          lineHeight: theme("fontSize.base[1].lineHeight"),
          letterSpacing: theme("fontSize.base[1].letterSpacing"),
          fontWeight: "400",
        },
        ".s-copy-lg": {
          fontSize: theme("fontSize.lg[0]"),
          lineHeight: theme("fontSize.lg[1].lineHeight"),
          letterSpacing: theme("fontSize.lg[1].letterSpacing"),
          fontWeight: "400",
        },
        ".s-copy-xl": {
          fontSize: theme("fontSize.xl[0]"),
          lineHeight: theme("fontSize.xl[1].lineHeight"),
          letterSpacing: theme("fontSize.xl[1].letterSpacing"),
          fontWeight: "400",
        },
        ".s-copy-2xl": {
          fontSize: theme("fontSize.2xl[0]"),
          lineHeight: theme("fontSize.2xl[1].lineHeight"),
          letterSpacing: theme("fontSize.2xl[1].letterSpacing"),
          fontWeight: "400",
        },
      });
    }),
  ],
  prefix: "s-",
  content: ["./src/**/*.{html,js,ts,jsx,tsx}"],
  safelist: [
    ...safeColorlist,
    "s-grid-rows-2",
    "s-grid-rows-3",
    "s-grid-rows-4",
    "s-grid-rows-5",
    // Add label classes to safelist
    "s-label-xs",
    "s-label-sm",
    "s-label-base",
    // Add copy classes to safelist
    "s-copy-xs",
    "s-copy-sm",
    "s-copy-base",
    "s-copy-lg",
    "s-copy-xl",
    // Add heading classes to safelist to ensure they're always included
    "s-heading-base",
    "s-heading-lg",
    "s-heading-xl",
    "s-heading-2xl",
    "s-heading-3xl",
    "s-heading-4xl",
    "s-heading-5xl",
    "s-heading-6xl",
    "s-heading-7xl",
    "s-heading-8xl",
    "s-heading-9xl",
    // Add mono heading classes to safelist
    "s-heading-mono-lg",
    "s-heading-mono-xl",
    "s-heading-mono-2xl",
    "s-heading-mono-3xl",
    "s-heading-mono-4xl",
    "s-heading-mono-5xl",
    "s-heading-mono-6xl",
    "s-heading-mono-7xl",
    "s-heading-mono-8xl",
    "s-heading-mono-9xl",
  ],
  colors: customColors,
};
