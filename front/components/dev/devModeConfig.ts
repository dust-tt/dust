// Pure data definitions for the dev console: color tokens, typography tokens, font lists.
// No side effects, no React imports.

// ── Color tokens ──

export interface ColorToken {
  label: string;
  defaultLight: string;
  defaultDark: string;
  properties: ("bg" | "text" | "border")[];
  cssName?: string;
}

export interface ColorGroup {
  label: string;
  tokens: Record<string, ColorToken>;
}

export const COLOR_GROUPS: ColorGroup[] = [
  {
    label: "Structural",
    tokens: {
      background: {
        label: "background",
        defaultLight: "#FFFFFF",
        defaultDark: "#111418",
        properties: ["bg"],
      },
      foreground: {
        label: "foreground",
        defaultLight: "#111418",
        defaultDark: "#D3D5D9",
        properties: ["text"],
      },
      muted: {
        label: "muted",
        defaultLight: "#F7F7F7",
        defaultDark: "#111418",
        properties: ["bg"],
      },
      "muted-foreground": {
        label: "muted-foreground",
        defaultLight: "#545D6C",
        defaultDark: "#969CA5",
        properties: ["text"],
      },
      "muted-background": {
        label: "muted-background",
        defaultLight: "#F7F7F7",
        defaultDark: "#1C222D",
        properties: ["bg"],
      },
      hover: {
        label: "hover",
        defaultLight: "#EEEEEF",
        defaultDark: "#2A3241",
        properties: ["bg"],
      },
      faint: {
        label: "faint",
        defaultLight: "#969CA5",
        defaultDark: "#545D6C",
        properties: ["text"],
      },
    },
  },
  {
    label: "Primary",
    tokens: {
      "primary-950": {
        label: "primary-950",
        defaultLight: "#111418",
        defaultDark: "#F0F1F1",
        properties: ["bg", "text"],
        cssName: "primary-950",
      },
      "primary-800": {
        label: "primary-800",
        defaultLight: "#2A3241",
        defaultDark: "#B2B6BD",
        properties: ["bg", "text"],
        cssName: "primary-800",
      },
      "primary-500": {
        label: "primary-500",
        defaultLight: "#7B818D",
        defaultDark: "#7B818D",
        properties: ["bg", "text"],
        cssName: "primary-500",
      },
      "primary-300": {
        label: "primary-300",
        defaultLight: "#B2B6BD",
        defaultDark: "#2A3241",
        properties: ["bg", "text"],
        cssName: "primary-300",
      },
      "primary-100": {
        label: "primary-100",
        defaultLight: "#E8E9EA",
        defaultDark: "#181D26",
        properties: ["bg", "text"],
        cssName: "primary-100",
      },
    },
  },
  {
    label: "Highlight",
    tokens: {
      "highlight-500": {
        label: "highlight-500",
        defaultLight: "#1C91FF",
        defaultDark: "#1C91FF",
        properties: ["bg", "text", "border"],
        cssName: "highlight-500",
      },
      "highlight-400": {
        label: "highlight-400",
        defaultLight: "#4BABFF",
        defaultDark: "#085092",
        properties: ["bg", "text", "border"],
        cssName: "highlight-400",
      },
      "highlight-300": {
        label: "highlight-300",
        defaultLight: "#9FDBFF",
        defaultDark: "#063A6B",
        properties: ["bg", "text", "border"],
        cssName: "highlight-300",
      },
      "highlight-200": {
        label: "highlight-200",
        defaultLight: "#CFEAFF",
        defaultDark: "#042548",
        properties: ["bg", "text"],
        cssName: "highlight-200",
      },
      "highlight-muted": {
        label: "highlight-muted",
        defaultLight: "#8EB2D3",
        defaultDark: "#8EB2D3",
        properties: ["bg", "text"],
        cssName: "highlight-muted",
      },
    },
  },
  {
    label: "Feedback",
    tokens: {
      "success-500": {
        label: "success-500",
        defaultLight: "#6AA668",
        defaultDark: "#6AA668",
        properties: ["bg", "text"],
        cssName: "success-500",
      },
      "success-muted": {
        label: "success-muted",
        defaultLight: "#A9B8A9",
        defaultDark: "#A9B8A9",
        properties: ["bg", "text"],
        cssName: "success-muted",
      },
      "warning-500": {
        label: "warning-500",
        defaultLight: "#E14322",
        defaultDark: "#E14322",
        properties: ["bg", "text"],
        cssName: "warning-500",
      },
      "warning-muted": {
        label: "warning-muted",
        defaultLight: "#D5AAA1",
        defaultDark: "#D5AAA1",
        properties: ["bg", "text"],
        cssName: "warning-muted",
      },
      "info-500": {
        label: "info-500",
        defaultLight: "#FFAA0D",
        defaultDark: "#FFAA0D",
        properties: ["bg", "text"],
        cssName: "info-500",
      },
      "info-muted": {
        label: "info-muted",
        defaultLight: "#E1C99B",
        defaultDark: "#E1C99B",
        properties: ["bg", "text"],
        cssName: "info-muted",
      },
    },
  },
  {
    label: "Border",
    tokens: {
      border: {
        label: "border",
        defaultLight: "#EEEEEF",
        defaultDark: "#2A3241",
        properties: ["border"],
      },
      "border-dark": {
        label: "border-dark",
        defaultLight: "#DFE0E2",
        defaultDark: "#364153",
        properties: ["border"],
      },
      "border-focus": {
        label: "border-focus",
        defaultLight: "#4BABFF",
        defaultDark: "#085092",
        properties: ["border"],
      },
      separator: {
        label: "separator",
        defaultLight: "#EEEEEF",
        defaultDark: "#2A3241",
        properties: ["border"],
      },
      ring: {
        label: "ring",
        defaultLight: "#9FDBFF",
        defaultDark: "#364153",
        properties: ["border"],
      },
    },
  },
];

// Flat lookup for storage/injection.
export const ALL_TOKENS: Record<string, ColorToken> = {};
for (const group of COLOR_GROUPS) {
  for (const [key, token] of Object.entries(group.tokens)) {
    ALL_TOKENS[key] = token;
  }
}
export const ALL_TOKEN_NAMES = Object.keys(ALL_TOKENS);

// ── Typography tokens ──

export type TypoProp = "fontWeight" | "fontSize" | "lineHeight" | "letterSpacing";

export const TYPO_PROP_LABELS: Record<TypoProp, string> = {
  fontWeight: "w",
  fontSize: "s",
  lineHeight: "lh",
  letterSpacing: "ls",
};

export const TYPO_PROP_CSS: Record<TypoProp, string> = {
  fontWeight: "font-weight",
  fontSize: "font-size",
  lineHeight: "line-height",
  letterSpacing: "letter-spacing",
};

export const TYPO_PROPS: TypoProp[] = [
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
];

export interface TypoTokenDefaults {
  fontWeight: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
}

export interface TypoToken {
  label: string;
  selector: string;
  defaults: TypoTokenDefaults;
}

export interface TypoGroup {
  label: string;
  tokens: TypoToken[];
}

function typo(
  label: string,
  selector: string,
  fontSize: string,
  lineHeight: string,
  letterSpacing: string,
  fontWeight: string
): TypoToken {
  return {
    label,
    selector,
    defaults: { fontWeight, fontSize, lineHeight, letterSpacing },
  };
}

export const TYPO_GROUPS: TypoGroup[] = [
  {
    label: "Labels",
    tokens: [
      typo("label-xs", ".s-label-xs", "12px", "16px", "normal", "600"),
      typo("label-sm", ".s-label-sm", "14px", "20px", "-0.28px", "600"),
      typo("label-base", ".s-label-base", "16px", "24px", "-0.32px", "600"),
    ],
  },
  {
    label: "Headings",
    tokens: [
      typo("heading-xs", ".s-heading-xs", "12px", "16px", "normal", "600"),
      typo("heading-sm", ".s-heading-sm", "14px", "20px", "-0.28px", "600"),
      typo("heading-base", ".s-heading-base", "16px", "24px", "-0.32px", "600"),
      typo("heading-lg", ".s-heading-lg", "18px", "26px", "-0.36px", "600"),
      typo("heading-xl", ".s-heading-xl", "20px", "28px", "-0.4px", "600"),
      typo("heading-2xl", ".s-heading-2xl", "24px", "30px", "-0.96px", "600"),
      typo("heading-3xl", ".s-heading-3xl", "32px", "36px", "-1.28px", "600"),
      typo("heading-4xl", ".s-heading-4xl", "40px", "42px", "-2.4px", "500"),
      typo("heading-5xl", ".s-heading-5xl", "48px", "52px", "-2.88px", "500"),
    ],
  },
  {
    label: "Copy",
    tokens: [
      typo("copy-xs", ".s-copy-xs", "12px", "16px", "normal", "400"),
      typo("copy-sm", ".s-copy-sm", "14px", "20px", "-0.28px", "400"),
      typo("copy-base", ".s-copy-base", "16px", "24px", "-0.32px", "400"),
      typo("copy-lg", ".s-copy-lg", "18px", "26px", "-0.36px", "400"),
      typo("copy-xl", ".s-copy-xl", "20px", "28px", "-0.4px", "400"),
    ],
  },
  {
    label: "Mono Headings",
    tokens: [
      typo("heading-mono-lg", ".s-heading-mono-lg", "18px", "26px", "-0.36px", "400"),
      typo("heading-mono-xl", ".s-heading-mono-xl", "20px", "28px", "-0.4px", "400"),
      typo("heading-mono-2xl", ".s-heading-mono-2xl", "24px", "30px", "-0.96px", "400"),
    ],
  },
];

export const ALL_TYPO_TOKENS: Record<string, TypoToken> = {};
for (const group of TYPO_GROUPS) {
  for (const token of group.tokens) {
    ALL_TYPO_TOKENS[token.label] = token;
  }
}

// Each token can have overrides for any subset of properties.
export type TypoTokenOverride = Partial<Record<TypoProp, string>>;
export type TypoOverrides = Record<string, TypoTokenOverride>;

// ── Font families ──

export interface FontFamilyOverrides {
  sans?: string;
  mono?: string;
}

export const POPULAR_FONTS = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Montserrat",
  "Poppins",
  "Nunito",
  "Raleway",
  "Source Sans 3",
  "Work Sans",
  "DM Sans",
  "Plus Jakarta Sans",
  "Outfit",
  "Manrope",
  "Sora",
];

export const POPULAR_MONO_FONTS = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Roboto Mono",
  "Inconsolata",
  "Space Mono",
  "Ubuntu Mono",
];

// ── Misc constants ──

export type OverrideState = "on" | "off" | "default";
export type DockMode = "docked" | "floating";
export type ExpandedPanel = "flags" | "colors" | "typo" | null;

export const THEME_OPTIONS = ["light", "dark"] as const;
export const DOCK_BAR_HEIGHT = 33;
