/** @type {import('tailwindcss').Config} */
const colors = require("tailwindcss/colors");

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
  "indigo",
  "lime",
  "orange",
  "pink",
  "red",
  "sky",
  "teal",
  "amber",
  "cyan",
  "fuchsia",
  "violet",
  "yellow",
  "action",
  "slate", //To be cleaned after transition
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
    900: "#713912",
    800: "#B76020",
    700: "#E38122",
    600: "#F09517",
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

Object.assign(colors, {
  green: customColors.green,
  blue: customColors.blue,
  gray: customColors.gray,
  rose: customColors.rose,
  golden: customColors.golden,
  //For compatibility, to be removed after all direct color ref are edited for golden
  slate: customColors.gray,
  amber: customColors.golden,
  emerald: customColors.green,
  red: customColors.rose,
  pink: customColors.rose,
  sky: customColors.blue,
});

const safeColorlist = safeColorsArray.flatMap((color) => [
  // Include 50 shade
  `s-bg-${color}-50`,
  // Whitelist all bg colors from shade 100 to 900
  ...Array.from({ length: 9 }, (_, i) => `s-bg-${color}-${(i + 1) * 100}`),
  // Include 950 shade
  `s-bg-${color}-950`,
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
          "orange-golden": customColors.golden[500],
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
            DEFAULT: colors.gray[500],
            night: colors.gray[500],
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
  colors: customColors,
};
