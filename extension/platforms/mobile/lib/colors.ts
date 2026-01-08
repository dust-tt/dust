/**
 * Dust/Sparkle color palette for mobile
 * Adapted from @dust-tt/sparkle for React Native
 */

export const colors = {
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
  violet: {
    950: "#1C0633",
    900: "#3B0D71",
    800: "#5714B7",
    700: "#6D19E3",
    600: "#7C1CF0",
    500: "#8E1FFF",
    400: "#A94BFF",
    300: "#C47AFF",
    200: "#DA9FFF",
    100: "#ECCAFF",
    50: "#F6E9FF",
  },
  red: {
    950: "#220404",
    900: "#570909",
    800: "#8C0D0D",
    700: "#B21313",
    600: "#C91313",
    500: "#E12222",
    400: "#ED6C6C",
    300: "#F8A6A6",
    200: "#FFC3C3",
    100: "#FFDCDC",
    50: "#FFF1F1",
  },
  white: "#FFFFFF",
  black: "#000000",
  transparent: "transparent",
} as const;

// Semantic color mappings for light mode
export const semanticLight = {
  // Primary (gray-based)
  primary: colors.gray[950],
  primaryForeground: colors.white,

  // Background
  background: colors.white,
  foreground: colors.gray[950],

  // Muted
  muted: colors.gray[100],
  mutedForeground: colors.gray[500],

  // Card
  card: colors.white,
  cardForeground: colors.gray[950],

  // Border
  border: colors.gray[200],
  input: colors.gray[200],

  // Highlight (blue-based for actions)
  highlight: colors.blue[500],
  highlightForeground: colors.white,

  // Success (green-based)
  success: colors.green[600],
  successForeground: colors.white,

  // Warning (golden-based)
  warning: colors.golden[500],
  warningForeground: colors.gray[950],

  // Destructive (rose-based)
  destructive: colors.rose[500],
  destructiveForeground: colors.white,

  // Ring
  ring: colors.blue[500],

  // Accent
  accent: colors.gray[100],
  accentForeground: colors.gray[950],
} as const;

// Semantic color mappings for dark mode
export const semanticDark = {
  // Primary (gray-based inverted)
  primary: colors.gray[50],
  primaryForeground: colors.gray[950],

  // Background
  background: colors.gray[950],
  foreground: colors.gray[50],

  // Muted
  muted: colors.gray[800],
  mutedForeground: colors.gray[400],

  // Card
  card: colors.gray[900],
  cardForeground: colors.gray[50],

  // Border
  border: colors.gray[700],
  input: colors.gray[700],

  // Highlight (blue-based for actions)
  highlight: colors.blue[400],
  highlightForeground: colors.gray[950],

  // Success (green-based)
  success: colors.green[400],
  successForeground: colors.gray[950],

  // Warning (golden-based)
  warning: colors.golden[400],
  warningForeground: colors.gray[950],

  // Destructive (rose-based)
  destructive: colors.rose[400],
  destructiveForeground: colors.gray[950],

  // Ring
  ring: colors.blue[400],

  // Accent
  accent: colors.gray[800],
  accentForeground: colors.gray[50],
} as const;

export type ColorPalette = typeof colors;
export type SemanticColors = typeof semanticLight;
