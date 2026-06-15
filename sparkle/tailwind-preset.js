/** @type {import('tailwindcss').Config} */
const plugin = require("tailwindcss/plugin");

// Standard shades present on every palette color.
const standardShades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

// Build a Tailwind color object that references CSS custom properties from tokens.css.
function paletteColor(name, extraShades = []) {
  const shades = [...standardShades, ...extraShades].sort((a, b) => a - b);
  return Object.fromEntries(
    shades.map((s) => [s, `var(--color-${name}-${s})`])
  );
}

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
        DEFAULT: "0 2px 4px #11141810",
        sm: "0 1px 2px #1114180D",
        md: "0 4px 6px #1114181F",
        lg: "0 10px 15px #1114181F",
        xl: "0 20px 20px #1114181F",
        "2xl": "0 25px 35px #1114181F",
      },
      boxShadow: {
        DEFAULT: "0 2px 6px 0 #1114181A",
        md: "0 4px 12px #1114181F",
        lg: "0 10px 20px #1114181F",
        xl: "0 20px 25px #1114181F",
        "2xl": "0 25px 50px #1114181F",
      },
      zIndex: {
        60: "60",
      },
      width: { ...sizeScale },
      height: { ...sizeScale },
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
        gray: paletteColor("gray", [150, 850]),
        stone: paletteColor("stone", [25, 150]),
        golden: paletteColor("golden"),
        blue: paletteColor("blue"),
        green: paletteColor("green"),
        rose: paletteColor("rose"),
        violet: paletteColor("violet"),
        red: paletteColor("red"),
        orange: paletteColor("orange"),
        lime: paletteColor("lime"),
        emerald: paletteColor("emerald"),
        pink: paletteColor("pink"),
        // Compatibility aliases — migrate to golden/blue then remove.
        amber: paletteColor("golden"),
        sky: paletteColor("blue"),
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
  plugins: [typographyPlugin],
};

module.exports.sizeScale = sizeScale;
