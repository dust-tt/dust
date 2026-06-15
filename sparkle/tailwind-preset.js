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

const customColors = {
  gray: {
    950: "#111418",
    900: "#1C222D",
    850: "#232A37",
    800: "#2A3241",
    700: "#364153",
    600: "#596170",
    500: "#7B818D",
    400: "#969CA5",
    300: "#B2B6BD",
    200: "#D3D5D9",
    150: "#DFE0E2",
    100: "#EEEEEF",
    50: "#F7F7F7",
  },
  stone: {
    950: "#0C0A09",
    900: "#1C1917",
    800: "#292524",
    700: "#44403B",
    600: "#57534D",
    500: "#79716B",
    400: "#A6A09B",
    300: "#D6D3D1",
    200: "#E7E5E4",
    150: "#EEEEEC",
    100: "#F5F5F4",
    50: "#FBFAF9",
    25: "#FDFDFC",
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
  stone: customColors.stone,
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

const colorNames = Object.keys(colors).filter(
  (color) =>
    typeof colors[color] === "object" &&
    !["transparent", "current", "inherit", "white", "black"].includes(color)
);

// Shared numeric px-size scale applied to w/h/min-*/max-* utilities.
const sizeScale = {
  100: "400px",
  125: "500px",
  150: "600px",
};

const fontSize = {
  xs: ["12px", { lineHeight: "16px", letterSpacing: "normal" }],
  sm: ["14px", { lineHeight: "20px", letterSpacing: "-0.28px" }],
  base: ["16px", { lineHeight: "24px", letterSpacing: "-0.32px" }],
  lg: ["18px", { lineHeight: "26px", letterSpacing: "-0.36px" }],
  xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.4px" }],
  "2xl": ["24px", { lineHeight: "30px", letterSpacing: "-0.96px" }],
  "3xl": ["32px", { lineHeight: "36px", letterSpacing: "-1.28px" }],
  "4xl": ["40px", { lineHeight: "42px", letterSpacing: "-2.4px" }],
  "5xl": ["48px", { lineHeight: "52px", letterSpacing: "-2.88px" }],
  "6xl": ["56px", { lineHeight: "60px", letterSpacing: "-3.36px" }],
  "7xl": ["64px", { lineHeight: "68px", letterSpacing: "-3.84px" }],
  "8xl": ["72px", { lineHeight: "76px", letterSpacing: "-4.32px" }],
  "9xl": ["80px", { lineHeight: "84px", letterSpacing: "-4.8px" }],
};

// Typography component classes. `addComponents` (not `addBase`) so that
// Tailwind's prefix pipeline auto-applies the consumer's prefix:
// sparkle emits `.s-heading-base`, front emits `.heading-base`.
const typographyPlugin = plugin(function ({ addComponents, theme }) {
  const label = (size) => ({
    fontSize: theme(`fontSize.${size}[0]`),
    lineHeight: theme(`fontSize.${size}[1].lineHeight`),
    letterSpacing: theme(`fontSize.${size}[1].letterSpacing`),
    fontWeight: "500",
  });
  const headingHeavy = (size) => ({
    fontSize: theme(`fontSize.${size}[0]`),
    lineHeight: theme(`fontSize.${size}[1].lineHeight`),
    letterSpacing: theme(`fontSize.${size}[1].letterSpacing`),
    fontWeight: "550",
  });
  const headingLight = (size) => ({
    fontSize: theme(`fontSize.${size}[0]`),
    lineHeight: theme(`fontSize.${size}[1].lineHeight`),
    letterSpacing: theme(`fontSize.${size}[1].letterSpacing`),
    fontWeight: "450",
  });
  const headingMono = (size) => ({
    fontSize: theme(`fontSize.${size}[0]`),
    lineHeight: theme(`fontSize.${size}[1].lineHeight`),
    letterSpacing: theme(`fontSize.${size}[1].letterSpacing`),
    fontWeight: "400",
    fontFamily: theme("fontFamily.mono"),
  });
  const copy = (size) => ({
    fontSize: theme(`fontSize.${size}[0]`),
    lineHeight: theme(`fontSize.${size}[1].lineHeight`),
    letterSpacing: theme(`fontSize.${size}[1].letterSpacing`),
    fontWeight: "400",
  });

  addComponents({
    ".label-xs": label("xs"),
    ".label-sm": label("sm"),
    ".label-base": label("base"),
    ".heading-xs": headingHeavy("xs"),
    ".heading-sm": headingHeavy("sm"),
    ".heading-base": headingHeavy("base"),
    ".heading-lg": headingHeavy("lg"),
    ".heading-xl": headingHeavy("xl"),
    ".heading-2xl": headingHeavy("2xl"),
    ".heading-3xl": headingHeavy("3xl"),
    ".heading-4xl": headingLight("4xl"),
    ".heading-5xl": headingLight("5xl"),
    ".heading-6xl": headingLight("6xl"),
    ".heading-7xl": headingLight("7xl"),
    ".heading-8xl": headingLight("8xl"),
    ".heading-9xl": headingLight("9xl"),
    ".heading-mono-lg": headingMono("lg"),
    ".heading-mono-xl": headingMono("xl"),
    ".heading-mono-2xl": headingMono("2xl"),
    ".heading-mono-3xl": headingMono("3xl"),
    ".heading-mono-4xl": headingMono("4xl"),
    ".heading-mono-5xl": headingMono("5xl"),
    ".heading-mono-6xl": headingMono("6xl"),
    ".heading-mono-7xl": headingMono("7xl"),
    ".heading-mono-8xl": headingMono("8xl"),
    ".heading-mono-9xl": headingMono("9xl"),
    ".copy-xs": copy("xs"),
    ".copy-sm": copy("sm"),
    ".copy-base": copy("base"),
    ".copy-lg": copy("lg"),
    ".copy-xl": copy("xl"),
    ".copy-2xl": copy("2xl"),
  });
});

// Tailwind's `safelist` option is a *replacement* (not merged) in preset
// merge semantics, and it matches against *final rendered* class names — so
// each consumer must provide its own safelist with the prefix baked in.
// `buildSafelist(prefix)` returns the shared entries pre-prefixed; consumers
// spread it and append their package-specific extras.
const sharedSafelistNames = [
  "grid-rows-2",
  "grid-rows-3",
  "grid-rows-4",
  "grid-rows-5",
  "label-xs",
  "label-sm",
  "label-base",
  "copy-xs",
  "copy-sm",
  "copy-base",
  "copy-lg",
  "copy-xl",
  "heading-base",
  "heading-lg",
  "heading-xl",
  "heading-2xl",
  "heading-3xl",
  "heading-4xl",
  "heading-5xl",
  "heading-6xl",
  "heading-7xl",
  "heading-8xl",
  "heading-9xl",
  "heading-mono-lg",
  "heading-mono-xl",
  "heading-mono-2xl",
  "heading-mono-3xl",
  "heading-mono-4xl",
  "heading-mono-5xl",
  "heading-mono-6xl",
  "heading-mono-7xl",
  "heading-mono-8xl",
  "heading-mono-9xl",
];

function buildSafelist({ prefix = "", avatarProps = "(bg|text)" } = {}) {
  return [
    {
      pattern: new RegExp(
        `^${prefix}${avatarProps}-(gray|blue|violet|pink|red|orange|golden|lime|emerald)-(100|200|300|400|500|600|700|800|900)$`
      ),
    },
    ...sharedSafelistNames.map((name) => `${prefix}${name}`),
  ];
}

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
      sans: ["Geist", "sans-serif"],
      mono: ["Geist Mono", "monospace"],
    },
    fontSize,
    extend: {
      spacing: {
        "sidebar-side-spacing": "0.75rem",
      },
      transitionTimingFunction: {
        "out-quad": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "out-cubic": "cubic-bezier(0.215, 0.61, 0.355, 1)",
        "out-quart": "cubic-bezier(0.165, 0.84, 0.44, 1)",
        "out-quint": "cubic-bezier(0.23, 1, 0.32, 1)",
        "out-expo": "cubic-bezier(0.19, 1, 0.22, 1)",
        "in-out-quad": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
        "in-out-cubic": "cubic-bezier(0.645, 0.045, 0.355, 1)",
        "in-out-quint": "cubic-bezier(0.86, 0, 0.07, 1)",
        enter: "cubic-bezier(0.215, 0.61, 0.355, 1)",
        emphasized: "cubic-bezier(0.23, 1, 0.32, 1)",
        move: "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
        "in-quad": "cubic-bezier(.55, .085, .68, .53)",
        "in-cubic": "cubic-bezier(.550, .055, .675, .19)",
        "in-quart": "cubic-bezier(.895, .03, .685, .22)",
        "in-quint": "cubic-bezier(.755, .05, .855, .06)",
        "in-expo": "cubic-bezier(.95, .05, .795, .035)",
        "in-circ": "cubic-bezier(.6, .04, .98, .335)",
      },
      transitionDuration: {
        enter: "200ms",
        exit: "160ms",
        "modal-enter": "300ms",
        "modal-exit": "240ms",
      },
      borderRadius: {
        "4xl": "2rem",
      },
      // Container query breakpoints are now defined via @custom-variant in CSS.
      // Removed from here because v4 unifies --container-* with max-w-*, and
      // these values (e.g. xl: 80rem) were overriding the standard max-w scale.
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
      width: { ...sizeScale },
      height: { ...sizeScale },
      minHeight: (theme) => ({ ...theme("spacing") }),
      keyframes: {
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
          "0%, 100%": { filter: "brightness(105%)" },
          "50%": { filter: "brightness(80%)" },
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
        "move-square": "move-square 3s ease-out infinite",
        breathing: "breathing 3s infinite ease-in-out",
        "breathing-scale": "breathing-scale 3s infinite ease-in-out",
      },
      colors: {
        // Palette colors — each shade references a CSS custom property from tokens.css
        // that automatically switches between light/dark values.
        ...Object.fromEntries(
          colorNames
            .filter((name) =>
              [
                "gray",
                "stone",
                "golden",
                "blue",
                "green",
                "rose",
                "violet",
                "red",
                "orange",
                "lime",
                "emerald",
                "pink",
              ].includes(name)
            )
            .map((colorName) => [
              colorName,
              Object.fromEntries(
                Object.keys(colors[colorName])
                  .filter((shade) => !isNaN(Number(shade)))
                  .map((shade) => [shade, `var(--color-${colorName}-${shade})`])
              ),
            ])
        ),
        // Brand colors (static values, no dark mode switching)
        brand: {
          DEFAULT: "var(--color-brand)",
          "hunter-green": "var(--color-brand-hunter-green)",
          "tea-green": "var(--color-brand-tea-green)",
          "support-green": "var(--color-brand-support-green)",
          "electric-blue": "var(--color-brand-electric-blue)",
          "sky-blue": "var(--color-brand-sky-blue)",
          "support-blue": "var(--color-brand-support-blue)",
          "red-rose": "var(--color-brand-red-rose)",
          "pink-rose": "var(--color-brand-pink-rose)",
          "support-rose": "var(--color-brand-support-rose)",
          "orange-golden": "var(--color-brand-orange-golden)",
          "sunshine-golden": "var(--color-brand-sunshine-golden)",
          "support-golden": "var(--color-brand-support-golden)",
          "dark-gray": "var(--color-brand-dark-gray)",
          "light-gray": "var(--color-brand-light-gray)",
          "support-gray": "var(--color-brand-support-gray)",
        },
        // Semantic tokens — all reference CSS custom properties from tokens.css
        // that automatically switch between light/dark values via :root / .dark.
        border: {
          DEFAULT: "var(--color-border)",
          dark: "var(--color-border-dark)",
          focus: "var(--color-border-focus)",
          warning: "var(--color-border-warning)",
        },
        separator: "var(--color-separator)",
        ring: {
          DEFAULT: "var(--color-ring)",
          warning: "var(--color-ring-warning)",
        },
        background: "var(--color-background)",
        "app-background": "var(--color-app-background)",
        panel: {
          background: "var(--color-panel-background)",
        },
        foreground: {
          DEFAULT: "var(--color-foreground)",
          warning: "var(--color-foreground-warning)",
        },
        hover: "var(--color-hover)",
        muted: {
          DEFAULT: "var(--color-muted)",
          foreground: "var(--color-muted-foreground)",
          background: "var(--color-muted-background)",
        },
        faint: "var(--color-faint)",
        primary: {
          DEFAULT: "var(--color-primary)",
          light: "var(--color-primary-light)",
          dark: "var(--color-primary-dark)",
          muted: "var(--color-primary-muted)",
          950: "var(--color-primary-950)",
          900: "var(--color-primary-900)",
          800: "var(--color-primary-800)",
          700: "var(--color-primary-700)",
          600: "var(--color-primary-600)",
          500: "var(--color-primary-500)",
          400: "var(--color-primary-400)",
          300: "var(--color-primary-300)",
          200: "var(--color-primary-200)",
          150: "var(--color-primary-150)",
          100: "var(--color-primary-100)",
          50: "var(--color-primary-50)",
        },
        highlight: {
          DEFAULT: "var(--color-highlight)",
          light: "var(--color-highlight-light)",
          dark: "var(--color-highlight-dark)",
          muted: "var(--color-highlight-muted)",
          950: "var(--color-highlight-950)",
          900: "var(--color-highlight-900)",
          800: "var(--color-highlight-800)",
          700: "var(--color-highlight-700)",
          600: "var(--color-highlight-600)",
          500: "var(--color-highlight-500)",
          400: "var(--color-highlight-400)",
          300: "var(--color-highlight-300)",
          200: "var(--color-highlight-200)",
          100: "var(--color-highlight-100)",
          50: "var(--color-highlight-50)",
        },
        warning: {
          DEFAULT: "var(--color-warning)",
          light: "var(--color-warning-light)",
          dark: "var(--color-warning-dark)",
          muted: "var(--color-warning-muted)",
          950: "var(--color-warning-950)",
          900: "var(--color-warning-900)",
          800: "var(--color-warning-800)",
          700: "var(--color-warning-700)",
          600: "var(--color-warning-600)",
          500: "var(--color-warning-500)",
          400: "var(--color-warning-400)",
          300: "var(--color-warning-300)",
          200: "var(--color-warning-200)",
          100: "var(--color-warning-100)",
          50: "var(--color-warning-50)",
        },
        success: {
          DEFAULT: "var(--color-success)",
          light: "var(--color-success-light)",
          dark: "var(--color-success-dark)",
          muted: "var(--color-success-muted)",
          950: "var(--color-success-950)",
          900: "var(--color-success-900)",
          800: "var(--color-success-800)",
          700: "var(--color-success-700)",
          600: "var(--color-success-600)",
          500: "var(--color-success-500)",
          400: "var(--color-success-400)",
          300: "var(--color-success-300)",
          200: "var(--color-success-200)",
          100: "var(--color-success-100)",
          50: "var(--color-success-50)",
        },
        sidebar: {
          primary: "var(--color-sidebar-primary)",
          foreground: "var(--color-sidebar-foreground)",
        },
        info: {
          DEFAULT: "var(--color-info)",
          light: "var(--color-info-light)",
          dark: "var(--color-info-dark)",
          muted: "var(--color-info-muted)",
          950: "var(--color-info-950)",
          900: "var(--color-info-900)",
          800: "var(--color-info-800)",
          700: "var(--color-info-700)",
          600: "var(--color-info-600)",
          500: "var(--color-info-500)",
          400: "var(--color-info-400)",
          300: "var(--color-info-300)",
          200: "var(--color-info-200)",
          100: "var(--color-info-100)",
          50: "var(--color-info-50)",
        },
      },
    },
  },
  variants: {
    extend: {
      backgroundColor: ["dark"],
    },
  },
  plugins: [typographyPlugin],
};

module.exports.buildSafelist = buildSafelist;
module.exports.sizeScale = sizeScale;
