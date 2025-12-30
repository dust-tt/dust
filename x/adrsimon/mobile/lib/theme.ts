import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";
import { colors } from "./colors";

/**
 * Theme configuration aligned with Sparkle design system
 */
export const THEME = {
  light: {
    // Background & Foreground
    background: colors.white,
    foreground: colors.gray[950],

    // Card
    card: colors.white,
    cardForeground: colors.gray[950],

    // Popover
    popover: colors.white,
    popoverForeground: colors.gray[950],

    // Primary (dark gray like Sparkle)
    primary: colors.gray[950],
    primaryForeground: colors.white,

    // Secondary
    secondary: colors.gray[100],
    secondaryForeground: colors.gray[950],

    // Muted
    muted: colors.gray[100],
    mutedForeground: colors.gray[500],

    // Accent
    accent: colors.gray[100],
    accentForeground: colors.gray[950],

    // Highlight (blue - for primary actions)
    highlight: colors.blue[500],
    highlightForeground: colors.white,

    // Success (green)
    success: colors.green[600],
    successForeground: colors.white,

    // Warning (golden)
    warning: colors.golden[500],
    warningForeground: colors.gray[950],

    // Destructive (rose)
    destructive: colors.rose[500],
    destructiveForeground: colors.white,

    // Border & Input
    border: colors.gray[200],
    input: colors.gray[200],
    ring: colors.blue[500],
  },
  dark: {
    // Background & Foreground
    background: colors.gray[950],
    foreground: colors.gray[50],

    // Card
    card: colors.gray[900],
    cardForeground: colors.gray[50],

    // Popover
    popover: colors.gray[900],
    popoverForeground: colors.gray[50],

    // Primary (light gray inverted)
    primary: colors.gray[50],
    primaryForeground: colors.gray[950],

    // Secondary
    secondary: colors.gray[800],
    secondaryForeground: colors.gray[50],

    // Muted
    muted: colors.gray[800],
    mutedForeground: colors.gray[400],

    // Accent
    accent: colors.gray[800],
    accentForeground: colors.gray[50],

    // Highlight (blue - for primary actions)
    highlight: colors.blue[400],
    highlightForeground: colors.gray[950],

    // Success (green)
    success: colors.green[400],
    successForeground: colors.gray[950],

    // Warning (golden)
    warning: colors.golden[400],
    warningForeground: colors.gray[950],

    // Destructive (rose)
    destructive: colors.rose[400],
    destructiveForeground: colors.gray[950],

    // Border & Input
    border: colors.gray[700],
    input: colors.gray[700],
    ring: colors.blue[400],
  },
};

export const NAV_THEME: Record<"light" | "dark", Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.highlight, // Use highlight for navigation primary
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.highlight, // Use highlight for navigation primary
      text: THEME.dark.foreground,
    },
  },
};
