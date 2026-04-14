import { useTheme } from "@app/components/sparkle/ThemeContext";
import {
  isWhitelistableFeature,
  WHITELISTABLE_FEATURES_CONFIG,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  getFeatureFlagOverrides,
  writeFeatureFlagOverrides,
} from "./devFeatureFlagOverrides";
import { DEV_MODE_STORAGE_KEY } from "./devModeConstants";
import { type PerfMetrics, useDevPerf } from "./useDevPerf";

const COLOR_OVERRIDES_KEY = "dust_color_overrides";
const COLOR_STYLE_ID = "dust-dev-color-overrides";
const PANEL_POS_KEY = "dust_dev_panel_pos";
const DOCK_MODE_KEY = "dust_dev_dock_mode";

type OverrideState = "on" | "off" | "default";
type DockMode = "docked" | "floating";

// ── Color override types & config ──

interface ColorToken {
  /** Display name shown in the panel. */
  label: string;
  /** Default hex value for light mode. */
  defaultLight: string;
  /** Default hex value for dark mode. */
  defaultDark: string;
  /** CSS property prefixes to override (bg, text, border). */
  properties: ("bg" | "text" | "border")[];
  /** CSS class name segment (e.g. "primary-800"). Defaults to token key. */
  cssName?: string;
}

interface ColorGroup {
  label: string;
  tokens: Record<string, ColorToken>;
}

const COLOR_GROUPS: ColorGroup[] = [
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

// Build a flat lookup for storage/injection.
const ALL_TOKENS: Record<string, ColorToken> = {};
for (const group of COLOR_GROUPS) {
  for (const [key, token] of Object.entries(group.tokens)) {
    ALL_TOKENS[key] = token;
  }
}
const ALL_TOKEN_NAMES = Object.keys(ALL_TOKENS);

type ColorOverrides = Record<string, string>;

// ── Color override storage & style injection ──

function readColorOverrides(): ColorOverrides {
  try {
    return JSON.parse(sessionStorage.getItem(COLOR_OVERRIDES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeColorOverrides(overrides: ColorOverrides): void {
  if (Object.keys(overrides).length === 0) {
    sessionStorage.removeItem(COLOR_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(overrides));
  }
  injectColorStyles(overrides);
}

const CSS_PROPERTY_MAP: Record<string, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
};

function injectColorStyles(overrides: ColorOverrides): void {
  let styleEl = document.getElementById(COLOR_STYLE_ID) as HTMLStyleElement;

  if (Object.keys(overrides).length === 0) {
    styleEl?.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = COLOR_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const rules: string[] = [];
  const variantSuffixes = ["", "-light", "-dark", "-muted", "-foreground", "-background"];

  for (const [tokenName, color] of Object.entries(overrides)) {
    const token = ALL_TOKENS[tokenName];
    if (!token || !color) {
      continue;
    }

    const cssName = token.cssName ?? tokenName;

    for (const prop of token.properties) {
      const cssProperty = CSS_PROPERTY_MAP[prop];
      for (const suffix of variantSuffixes) {
        const className = `${prop}-${cssName}${suffix}`;
        rules.push(`.${className} { ${cssProperty}: ${color} !important; }`);
        rules.push(
          `.dark .${className}-night { ${cssProperty}: ${color} !important; }`
        );
        rules.push(`.s-${className} { ${cssProperty}: ${color} !important; }`);
        rules.push(
          `.dark .s-${className}-night { ${cssProperty}: ${color} !important; }`
        );
      }
    }
  }

  styleEl.textContent = rules.join("\n");
}

function readPosition(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem(PANEL_POS_KEY);
    if (raw) {
      const pos = JSON.parse(raw);
      if (typeof pos.x === "number" && typeof pos.y === "number") {
        return pos;
      }
    }
  } catch {
    // Ignore.
  }
  return { x: window.innerWidth - 380, y: 16 };
}

function readDockMode(): DockMode {
  return localStorage.getItem(DOCK_MODE_KEY) === "floating"
    ? "floating"
    : "docked";
}

// ── Typography override types & config ──

const TYPO_OVERRIDES_KEY = "dust_typo_overrides";
const TYPO_STYLE_ID = "dust-dev-typo-overrides";

type TypoProp = "fontWeight" | "fontSize" | "lineHeight" | "letterSpacing";

const TYPO_PROP_LABELS: Record<TypoProp, string> = {
  fontWeight: "weight",
  fontSize: "size",
  lineHeight: "line-h",
  letterSpacing: "spacing",
};

const TYPO_PROP_CSS: Record<TypoProp, string> = {
  fontWeight: "font-weight",
  fontSize: "font-size",
  lineHeight: "line-height",
  letterSpacing: "letter-spacing",
};

interface TypoTokenDefaults {
  fontWeight: string;
  fontSize: string;
  lineHeight: string;
  letterSpacing: string;
}

interface TypoToken {
  label: string;
  selector: string;
  defaults: TypoTokenDefaults;
}

interface TypoGroup {
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

const TYPO_GROUPS: TypoGroup[] = [
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

const ALL_TYPO_TOKENS: Record<string, TypoToken> = {};
for (const group of TYPO_GROUPS) {
  for (const token of group.tokens) {
    ALL_TYPO_TOKENS[token.label] = token;
  }
}

// Each token can have overrides for any subset of properties.
type TypoTokenOverride = Partial<Record<TypoProp, string>>;
type TypoOverrides = Record<string, TypoTokenOverride>;

function readTypoOverrides(): TypoOverrides {
  try {
    return JSON.parse(sessionStorage.getItem(TYPO_OVERRIDES_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function countTypoOverrides(overrides: TypoOverrides): number {
  let count = 0;
  for (const tokenOverride of Object.values(overrides)) {
    count += Object.keys(tokenOverride).length;
  }
  return count;
}

function writeTypoOverrides(overrides: TypoOverrides): void {
  // Clean up empty token entries.
  const cleaned: TypoOverrides = {};
  for (const [key, val] of Object.entries(overrides)) {
    if (Object.keys(val).length > 0) {
      cleaned[key] = val;
    }
  }
  if (Object.keys(cleaned).length === 0) {
    sessionStorage.removeItem(TYPO_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(TYPO_OVERRIDES_KEY, JSON.stringify(cleaned));
  }
  injectTypoStyles(cleaned);
}

function injectTypoStyles(overrides: TypoOverrides): void {
  let styleEl = document.getElementById(TYPO_STYLE_ID) as HTMLStyleElement;

  if (Object.keys(overrides).length === 0) {
    styleEl?.remove();
    return;
  }

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = TYPO_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const rules: string[] = [];
  for (const [tokenName, props] of Object.entries(overrides)) {
    const token = ALL_TYPO_TOKENS[tokenName];
    if (!token) {
      continue;
    }
    const declarations = Object.entries(props)
      .map(([prop, value]) => `${TYPO_PROP_CSS[prop as TypoProp]}: ${value} !important`)
      .join("; ");
    if (declarations) {
      rules.push(`${token.selector} { ${declarations}; }`);
    }
  }

  styleEl.textContent = rules.join("\n");
}

// ── Font family override ──

const FONT_FAMILY_OVERRIDES_KEY = "dust_font_family_overrides";
const FONT_FAMILY_STYLE_ID = "dust-dev-font-family-overrides";
const FONT_FAMILY_LINK_ID = "dust-dev-google-font";

interface FontFamilyOverrides {
  sans?: string;
  mono?: string;
}

const POPULAR_FONTS = [
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

const POPULAR_MONO_FONTS = [
  "JetBrains Mono",
  "Fira Code",
  "Source Code Pro",
  "IBM Plex Mono",
  "Roboto Mono",
  "Inconsolata",
  "Space Mono",
  "Ubuntu Mono",
];

function readFontFamilyOverrides(): FontFamilyOverrides {
  try {
    return JSON.parse(
      sessionStorage.getItem(FONT_FAMILY_OVERRIDES_KEY) ?? "{}"
    );
  } catch {
    return {};
  }
}

function writeFontFamilyOverrides(overrides: FontFamilyOverrides): void {
  if (!overrides.sans && !overrides.mono) {
    sessionStorage.removeItem(FONT_FAMILY_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(
      FONT_FAMILY_OVERRIDES_KEY,
      JSON.stringify(overrides)
    );
  }
  injectFontFamilyStyles(overrides);
}

function injectFontFamilyStyles(overrides: FontFamilyOverrides): void {
  // Manage the Google Fonts link element.
  let linkEl = document.getElementById(
    FONT_FAMILY_LINK_ID
  ) as HTMLLinkElement | null;
  let styleEl = document.getElementById(
    FONT_FAMILY_STYLE_ID
  ) as HTMLStyleElement | null;

  const fontsToLoad = [overrides.sans, overrides.mono].filter(Boolean);

  if (fontsToLoad.length === 0) {
    linkEl?.remove();
    styleEl?.remove();
    return;
  }

  // Build Google Fonts URL.
  const families = fontsToLoad
    .map((f) => `family=${encodeURIComponent(f!)}:wght@100;200;300;400;500;600;700;800;900`)
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;

  if (!linkEl) {
    linkEl = document.createElement("link");
    linkEl.id = FONT_FAMILY_LINK_ID;
    linkEl.rel = "stylesheet";
    document.head.appendChild(linkEl);
  }
  linkEl.href = href;

  // Inject font-family overrides.
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = FONT_FAMILY_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const rules: string[] = [];
  if (overrides.sans) {
    rules.push(
      `* { font-family: "${overrides.sans}", sans-serif !important; }`
    );
    // Exclude mono elements from sans override.
    if (!overrides.mono) {
      rules.push(
        `.s-font-mono, code, pre, kbd, samp, [class*="heading-mono"] { font-family: "Geist Mono", monospace !important; }`
      );
    }
  }
  if (overrides.mono) {
    rules.push(
      `.s-font-mono, code, pre, kbd, samp, [class*="heading-mono"] { font-family: "${overrides.mono}", monospace !important; }`
    );
  }

  styleEl.textContent = rules.join("\n");
}

const ALL_FLAGS = Object.keys(
  WHITELISTABLE_FEATURES_CONFIG
).sort() as WhitelistableFeature[];
const THEME_OPTIONS = ["light", "dark"] as const;

// ── Shared font ──

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';

// ── Metric display helper ──

function MetricItem({
  label,
  value,
  color,
  tooltip,
}: {
  label: string;
  value: string;
  color?: string;
  tooltip?: string;
}) {
  return (
    <span
      title={tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 11,
        whiteSpace: "nowrap",
        cursor: tooltip ? "help" : undefined,
      }}
    >
      <span style={{ color: "#9ca3af" }}>{label}</span>
      <span style={{ color: color ?? "#ccc", fontWeight: 600 }}>{value}</span>
    </span>
  );
}

function PerfBar({ metrics }: { metrics: PerfMetrics }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      {metrics.memoryMb !== null && (
        <MetricItem
          label="Mem"
          value={`${(metrics.memoryMb / 1024).toFixed(2)}GB`}
          tooltip={[
            "JS Heap Memory (Chrome only)",
            `Used: ${metrics.memoryMb}MB`,
            "",
            "Good: <200MB",
            "Warning: 200-500MB",
            "Bad: >500MB",
            "",
            "High values may indicate memory leaks",
            "or large cached datasets.",
          ].join("\n")}
        />
      )}
      <MetricItem
        label="FPS"
        value={String(metrics.fps)}
        color={
          metrics.fps < 30
            ? "#ff6b6b"
            : metrics.fps < 50
              ? "#ffaa0d"
              : "#7fdbca"
        }
        tooltip={[
          "Frames Per Second",
          "Measured via requestAnimationFrame.",
          "",
          "Good: 60 (smooth)",
          "OK: 30-59 (noticeable lag)",
          "Bad: <30 (janky, stuttering UI)",
          "",
          "Drops during heavy renders,",
          "animations, or main thread work.",
        ].join("\n")}
      />
      <MetricItem
        label="Jank"
        value={`${metrics.jankPct}%`}
        color={
          metrics.jankPct > 12
            ? "#ff6b6b"
            : metrics.jankPct > 4
              ? "#ffaa0d"
              : "#ccc"
        }
        tooltip={[
          "Jank — UI sluggishness caused by long",
          "tasks (>50ms) blocking the main thread.",
          "Shows % of time blocked over the last 5s.",
          "",
          "Thresholds (derived from Web Vitals TBT):",
          "Good: <4% (<200ms blocked per 5s)",
          "Warning: 4-12% (200-600ms per 5s)",
          "Poor: >12% (>600ms per 5s)",
        ].join("\n")}
      />
      <MetricItem
        label="Net"
        value={String(metrics.netRequests)}
        tooltip={[
          "Network requests in the last 5 seconds.",
          "Counts both fetch() and XMLHttpRequest calls.",
        ].join("\n")}
      />
    </div>
  );
}

// ── Color override panel ──

interface ColorOverridePanelProps {
  onClose: () => void;
}

function ColorTokenRow({
  tokenKey,
  token,
  override,
  isDark,
  onSet,
  onClear,
}: {
  tokenKey: string;
  token: ColorToken;
  override: string | undefined;
  isDark: boolean;
  onSet: (key: string, color: string) => void;
  onClear: (key: string) => void;
}) {
  const defaultColor = isDark ? token.defaultDark : token.defaultLight;
  const displayColor = override ?? defaultColor;
  const isOverridden = !!override;
  const [editingHex, setEditingHex] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: "4px 16px 4px 24px",
        gap: 8,
        minHeight: 28,
      }}
    >
      {/* Color swatch with hidden color picker */}
      <label
        style={{
          position: "relative",
          width: 18,
          height: 18,
          borderRadius: 4,
          border: isOverridden ? "2px solid #7fdbca" : "1px solid #444",
          background: displayColor,
          cursor: "pointer",
          flexShrink: 0,
        }}
      >
        <input
          type="color"
          value={displayColor}
          onChange={(e) => onSet(tokenKey, e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            opacity: 0,
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: "pointer",
            border: "none",
          }}
        />
      </label>

      {/* Token name */}
      <span
        style={{
          flex: 1,
          fontSize: 12,
          fontFamily: "monospace",
          color: isOverridden ? "#e0e0e0" : "#9ca3af",
        }}
      >
        {token.label}
      </span>

      {/* Reset button (only when overridden) */}
      {isOverridden && (
        <button
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: 10,
            padding: "0 2px",
            lineHeight: 1,
          }}
          onClick={() => onClear(tokenKey)}
          title="Reset to default"
        >
          {"✕"}
        </button>
      )}

      {/* Editable hex value */}
      <input
        type="text"
        value={editingHex ?? displayColor.toLowerCase()}
        onChange={(e) => {
          const v = e.target.value;
          setEditingHex(v);
          if (/^#[0-9a-fA-F]{6}$/.test(v.trim())) {
            onSet(tokenKey, v.trim().toLowerCase());
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => {
          setEditingHex(displayColor.toLowerCase());
          e.currentTarget.style.borderColor = "#555";
          e.currentTarget.style.background = "#0f0f23";
        }}
        onBlur={(e) => {
          setEditingHex(null);
          e.currentTarget.style.borderColor = "transparent";
          e.currentTarget.style.background = "transparent";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: isOverridden ? "#7fdbca" : "#666",
          width: 68,
          textAlign: "right" as const,
          flexShrink: 0,
          background: "transparent",
          border: "1px solid transparent",
          borderRadius: 3,
          padding: "1px 4px",
          outline: "none",
        }}
      />
    </div>
  );
}

function ColorOverridePanel({ onClose }: ColorOverridePanelProps) {
  const { theme } = useTheme();
  const [overrides, setOverrides] =
    useState<ColorOverrides>(readColorOverrides);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState(false);
  const overrideCount = Object.keys(overrides).length;

  useEffect(() => {
    injectColorStyles(readColorOverrides());
  }, []);

  const setColor = useCallback(
    (token: string, color: string) => {
      const next = { ...overrides, [token]: color };
      setOverrides(next);
      writeColorOverrides(next);
    },
    [overrides]
  );

  const clearColor = useCallback(
    (token: string) => {
      const next = { ...overrides };
      delete next[token];
      setOverrides(next);
      writeColorOverrides(next);
    },
    [overrides]
  );

  const resetAll = useCallback(() => {
    setOverrides({});
    writeColorOverrides({});
  }, []);

  const copyAll = useCallback(() => {
    const isDark = theme === "dark";
    const snapshot: Record<string, string> = {};
    for (const [key, token] of Object.entries(ALL_TOKENS)) {
      snapshot[key] =
        overrides[key] ?? (isDark ? token.defaultDark : token.defaultLight);
    }
    void navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [theme, overrides]);

  const toggleGroup = useCallback(
    (label: string) => {
      setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
    },
    []
  );

  const isDark = theme === "dark";

  return (
    <>
      <div style={S.panelHeader}>
        <span style={S.headerTitle}>Color Overrides</span>
        <button style={S.headerBtn} onClick={onClose} title="Close">
          {"✕"}
        </button>
      </div>

      <div style={{ ...S.list, padding: 0 }}>
        {COLOR_GROUPS.map((group) => {
          const tokenEntries = Object.entries(group.tokens);
          const groupOverrideCount = tokenEntries.filter(
            ([key]) => key in overrides
          ).length;
          const isCollapsed = collapsed[group.label] ?? false;

          return (
            <div key={group.label}>
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.label)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid #2a2a4a",
                  cursor: "pointer",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#666",
                    width: 12,
                    textAlign: "center" as const,
                  }}
                >
                  {isCollapsed ? "\u25B6" : "\u25BC"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#e0e0e0",
                  }}
                >
                  {group.label}
                </span>
                <span style={{ fontSize: 11, color: "#666" }}>
                  ({tokenEntries.length})
                </span>
                {groupOverrideCount > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      background: "#7fdbca33",
                      color: "#7fdbca",
                      borderRadius: 8,
                      padding: "1px 6px",
                      marginLeft: "auto",
                    }}
                  >
                    {groupOverrideCount} modified
                  </span>
                )}
              </button>

              {/* Token rows */}
              {!isCollapsed && (
                <div style={{ padding: "4px 0" }}>
                  {tokenEntries.map(([key, token]) => (
                    <ColorTokenRow
                      key={key}
                      tokenKey={key}
                      token={token}
                      override={overrides[key]}
                      isDark={isDark}
                      onSet={setColor}
                      onClear={clearColor}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={S.footer}>
        <span>
          {overrideCount > 0 && (
            <button style={S.resetBtn} onClick={resetAll}>
              Reset
            </button>
          )}
        </span>
        <button
          style={{
            background: "none",
            border: "1px solid #555",
            color: copied ? "#7fdbca" : "#9ca3af",
            cursor: "pointer",
            fontSize: 10,
            padding: "2px 8px",
            borderRadius: 4,
          }}
          onClick={copyAll}
        >
          {copied ? "Copied!" : "Copy All"}
        </button>
      </div>
    </>
  );
}

// ── Typography override panel ──

interface TypoOverridePanelProps {
  onClose: () => void;
}

const TYPO_PROPS: TypoProp[] = [
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
];

function TypoPropInput({
  prop,
  value,
  defaultValue,
  onChange,
  onClear,
}: {
  prop: TypoProp;
  value: string | undefined;
  defaultValue: string;
  onChange: (value: string) => void;
  onClear: () => void;
}) {
  const isOverridden = value !== undefined;
  const display = value ?? defaultValue;
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 3,
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "#9ca3af",
          width: 42,
          textAlign: "right" as const,
        }}
      >
        {TYPO_PROP_LABELS[prop]}
      </span>
      <input
        type="text"
        value={editing ?? display}
        onChange={(e) => {
          const v = e.target.value;
          setEditing(v);
          if (v.trim()) {
            onChange(v.trim());
          }
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onFocus={(e) => {
          setEditing(display);
          e.currentTarget.style.borderColor = "#555";
          e.currentTarget.style.background = "#0f0f23";
        }}
        onBlur={(e) => {
          setEditing(null);
          e.currentTarget.style.borderColor = isOverridden
            ? "#7fdbca55"
            : "transparent";
          e.currentTarget.style.background = "transparent";
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        style={{
          fontSize: 11,
          fontFamily: "monospace",
          color: isOverridden ? "#7fdbca" : "#b0b0b8",
          width: 56,
          textAlign: "right" as const,
          background: "transparent",
          border: isOverridden
            ? "1px solid #7fdbca55"
            : "1px solid #333",
          borderRadius: 3,
          padding: "2px 4px",
          outline: "none",
        }}
      />
      {isOverridden && (
        <button
          style={{
            background: "none",
            border: "none",
            color: "#666",
            cursor: "pointer",
            fontSize: 8,
            padding: 0,
            lineHeight: 1,
          }}
          onClick={onClear}
          title="Reset"
        >
          {"✕"}
        </button>
      )}
    </div>
  );
}

function TypoTokenRow({
  token,
  override,
  onSetProp,
  onClearProp,
  onClearAll,
}: {
  token: TypoToken;
  override: TypoTokenOverride | undefined;
  onSetProp: (tokenLabel: string, prop: TypoProp, value: string) => void;
  onClearProp: (tokenLabel: string, prop: TypoProp) => void;
  onClearAll: (tokenLabel: string) => void;
}) {
  const hasOverrides = override && Object.keys(override).length > 0;

  return (
    <div
      style={{
        padding: "5px 12px 5px 24px",
        borderBottom: "1px solid #1a1a3a",
      }}
    >
      {/* Token name row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 3,
        }}
      >
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontFamily: "monospace",
            color: hasOverrides ? "#e0e0e0" : "#9ca3af",
          }}
        >
          {token.label}
        </span>
        {hasOverrides && (
          <button
            style={{
              background: "none",
              border: "none",
              color: "#666",
              cursor: "pointer",
              fontSize: 9,
              padding: "0 2px",
            }}
            onClick={() => onClearAll(token.label)}
            title="Reset all properties"
          >
            {"reset"}
          </button>
        )}
      </div>

      {/* Property editors */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
          paddingLeft: 36,
        }}
      >
        {TYPO_PROPS.map((prop) => (
          <TypoPropInput
            key={prop}
            prop={prop}
            value={override?.[prop]}
            defaultValue={token.defaults[prop]}
            onChange={(v) => onSetProp(token.label, prop, v)}
            onClear={() => onClearProp(token.label, prop)}
          />
        ))}
      </div>
    </div>
  );
}

function FontFamilySection({
  fontOverrides,
  onUpdate,
}: {
  fontOverrides: FontFamilyOverrides;
  onUpdate: (overrides: FontFamilyOverrides) => void;
}) {
  const [editingSans, setEditingSans] = useState<string | null>(null);
  const [editingMono, setEditingMono] = useState<string | null>(null);
  const sansTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const monoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedUpdateSans = useCallback(
    (value: string | undefined) => {
      if (sansTimerRef.current) {
        clearTimeout(sansTimerRef.current);
      }
      sansTimerRef.current = setTimeout(() => {
        onUpdate({ ...fontOverrides, sans: value });
      }, 500);
    },
    [fontOverrides, onUpdate]
  );

  const debouncedUpdateMono = useCallback(
    (value: string | undefined) => {
      if (monoTimerRef.current) {
        clearTimeout(monoTimerRef.current);
      }
      monoTimerRef.current = setTimeout(() => {
        onUpdate({ ...fontOverrides, mono: value });
      }, 500);
    },
    [fontOverrides, onUpdate]
  );

  return (
    <div style={{ borderBottom: "1px solid #2a2a4a" }}>
      {/* Sans font */}
      <div style={{ padding: "6px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "#b0b0b8", flex: 1 }}>
            Sans font
            <span style={{ color: "#666", marginLeft: 4 }}>
              (default: Geist)
            </span>
          </span>
          {fontOverrides.sans && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "#666",
                cursor: "pointer",
                fontSize: 9,
              }}
              onClick={() => onUpdate({ ...fontOverrides, sans: undefined })}
            >
              {"reset"}
            </button>
          )}
        </div>
        <input
          type="text"
          value={editingSans ?? fontOverrides.sans ?? ""}
          placeholder="Type a Google Font name..."
          onChange={(e) => {
            setEditingSans(e.target.value);
            debouncedUpdateSans(
              e.target.value.trim() || undefined
            );
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => setEditingSans(fontOverrides.sans ?? "")}
          onBlur={() => setEditingSans(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          style={{
            width: "100%",
            fontSize: 11,
            fontFamily: fontOverrides.sans
              ? `"${fontOverrides.sans}", sans-serif`
              : "inherit",
            color: fontOverrides.sans ? "#7fdbca" : "#888",
            background: "#0f0f23",
            border: fontOverrides.sans
              ? "1px solid #7fdbca55"
              : "1px solid #333",
            borderRadius: 4,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        {/* Quick picks */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            marginTop: 4,
          }}
        >
          {POPULAR_FONTS.map((f) => (
            <button
              key={f}
              style={{
                fontSize: 9,
                padding: "1px 5px",
                border:
                  fontOverrides.sans === f
                    ? "1px solid #7fdbca"
                    : "1px solid #333",
                borderRadius: 3,
                background:
                  fontOverrides.sans === f ? "#7fdbca22" : "transparent",
                color: fontOverrides.sans === f ? "#7fdbca" : "#888",
                cursor: "pointer",
              }}
              onClick={() => onUpdate({ ...fontOverrides, sans: f })}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Mono font */}
      <div style={{ padding: "6px 12px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            marginBottom: 4,
          }}
        >
          <span style={{ fontSize: 11, color: "#b0b0b8", flex: 1 }}>
            Mono font
            <span style={{ color: "#666", marginLeft: 4 }}>
              (default: Geist Mono)
            </span>
          </span>
          {fontOverrides.mono && (
            <button
              style={{
                background: "none",
                border: "none",
                color: "#666",
                cursor: "pointer",
                fontSize: 9,
              }}
              onClick={() => onUpdate({ ...fontOverrides, mono: undefined })}
            >
              {"reset"}
            </button>
          )}
        </div>
        <input
          type="text"
          value={editingMono ?? fontOverrides.mono ?? ""}
          placeholder="Type a Google Font name..."
          onChange={(e) => {
            setEditingMono(e.target.value);
            debouncedUpdateMono(
              e.target.value.trim() || undefined
            );
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onFocus={() => setEditingMono(fontOverrides.mono ?? "")}
          onBlur={() => setEditingMono(null)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          style={{
            width: "100%",
            fontSize: 11,
            fontFamily: fontOverrides.mono
              ? `"${fontOverrides.mono}", monospace`
              : "inherit",
            color: fontOverrides.mono ? "#7fdbca" : "#888",
            background: "#0f0f23",
            border: fontOverrides.mono
              ? "1px solid #7fdbca55"
              : "1px solid #333",
            borderRadius: 4,
            padding: "4px 8px",
            outline: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 3,
            marginTop: 4,
          }}
        >
          {POPULAR_MONO_FONTS.map((f) => (
            <button
              key={f}
              style={{
                fontSize: 9,
                padding: "1px 5px",
                border:
                  fontOverrides.mono === f
                    ? "1px solid #7fdbca"
                    : "1px solid #333",
                borderRadius: 3,
                background:
                  fontOverrides.mono === f ? "#7fdbca22" : "transparent",
                color: fontOverrides.mono === f ? "#7fdbca" : "#888",
                cursor: "pointer",
              }}
              onClick={() => onUpdate({ ...fontOverrides, mono: f })}
            >
              {f}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TypoOverridePanel({ onClose }: TypoOverridePanelProps) {
  const [overrides, setOverrides] =
    useState<TypoOverrides>(readTypoOverrides);
  const [fontOverrides, setFontOverrides] = useState<FontFamilyOverrides>(
    readFontFamilyOverrides
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const overrideCount = countTypoOverrides(overrides);
  const fontOverrideCount = (fontOverrides.sans ? 1 : 0) + (fontOverrides.mono ? 1 : 0);

  useEffect(() => {
    injectTypoStyles(readTypoOverrides());
    injectFontFamilyStyles(readFontFamilyOverrides());
  }, []);

  const setTokenProp = useCallback(
    (tokenLabel: string, prop: TypoProp, value: string) => {
      const next = {
        ...overrides,
        [tokenLabel]: { ...overrides[tokenLabel], [prop]: value },
      };
      setOverrides(next);
      writeTypoOverrides(next);
    },
    [overrides]
  );

  const clearTokenProp = useCallback(
    (tokenLabel: string, prop: TypoProp) => {
      const tokenOverride = { ...overrides[tokenLabel] };
      delete tokenOverride[prop];
      const next = { ...overrides, [tokenLabel]: tokenOverride };
      setOverrides(next);
      writeTypoOverrides(next);
    },
    [overrides]
  );

  const clearToken = useCallback(
    (tokenLabel: string) => {
      const next = { ...overrides };
      delete next[tokenLabel];
      setOverrides(next);
      writeTypoOverrides(next);
    },
    [overrides]
  );

  const resetAll = useCallback(() => {
    setOverrides({});
    writeTypoOverrides({});
    setFontOverrides({});
    writeFontFamilyOverrides({});
  }, []);

  const updateFontOverrides = useCallback((next: FontFamilyOverrides) => {
    setFontOverrides(next);
    writeFontFamilyOverrides(next);
  }, []);

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
  }, []);

  return (
    <>
      <div style={S.panelHeader}>
        <span style={S.headerTitle}>Typography</span>
        <button style={S.headerBtn} onClick={onClose} title="Close">
          {"✕"}
        </button>
      </div>

      <div style={{ ...S.list, padding: 0 }}>
        {/* Font family section */}
        <button
          onClick={() => toggleGroup("__fonts")}
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            padding: "8px 12px",
            background: "none",
            border: "none",
            borderBottom: "1px solid #2a2a4a",
            cursor: "pointer",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "#666",
              width: 12,
              textAlign: "center" as const,
            }}
          >
            {collapsed["__fonts"] ? "\u25B6" : "\u25BC"}
          </span>
          <span style={{ fontSize: 13, fontWeight: 600, color: "#e0e0e0" }}>
            Font Family
          </span>
          {fontOverrideCount > 0 && (
            <span
              style={{
                fontSize: 9,
                background: "#7fdbca33",
                color: "#7fdbca",
                borderRadius: 8,
                padding: "1px 6px",
                marginLeft: "auto",
              }}
            >
              {fontOverrideCount} modified
            </span>
          )}
        </button>
        {!collapsed["__fonts"] && (
          <FontFamilySection
            fontOverrides={fontOverrides}
            onUpdate={updateFontOverrides}
          />
        )}

        {/* Token groups */}
        {TYPO_GROUPS.map((group) => {
          const groupOverrideCount = group.tokens.filter(
            (t) =>
              overrides[t.label] &&
              Object.keys(overrides[t.label]).length > 0
          ).length;
          const isCollapsed = collapsed[group.label] ?? false;

          return (
            <div key={group.label}>
              <button
                onClick={() => toggleGroup(group.label)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  width: "100%",
                  padding: "8px 12px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid #2a2a4a",
                  cursor: "pointer",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#666",
                    width: 12,
                    textAlign: "center" as const,
                  }}
                >
                  {isCollapsed ? "\u25B6" : "\u25BC"}
                </span>
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "#e0e0e0",
                  }}
                >
                  {group.label}
                </span>
                <span style={{ fontSize: 11, color: "#666" }}>
                  ({group.tokens.length})
                </span>
                {groupOverrideCount > 0 && (
                  <span
                    style={{
                      fontSize: 9,
                      background: "#7fdbca33",
                      color: "#7fdbca",
                      borderRadius: 8,
                      padding: "1px 6px",
                      marginLeft: "auto",
                    }}
                  >
                    {groupOverrideCount} modified
                  </span>
                )}
              </button>

              {!isCollapsed && (
                <div>
                  {group.tokens.map((token) => (
                    <TypoTokenRow
                      key={token.label}
                      token={token}
                      override={overrides[token.label]}
                      onSetProp={setTokenProp}
                      onClearProp={clearTokenProp}
                      onClearAll={clearToken}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={S.footer}>
        <span>
          {overrideCount + fontOverrideCount > 0 && (
            <button style={S.resetBtn} onClick={resetAll}>
              Reset all
            </button>
          )}
        </span>
      </div>
    </>
  );
}

// ── Expanded panel content (shared between docked and floating) ──

interface PanelContentProps {
  serverFlags: WhitelistableFeature[];
  onClose: () => void;
}

function PanelContent({ serverFlags, onClose }: PanelContentProps) {
  const [search, setSearch] = useState("");
  const [overrides, setOverrides] = useState(getFeatureFlagOverrides);

  const serverFlagSet = useMemo(() => new Set(serverFlags), [serverFlags]);
  const overrideCount = Object.keys(overrides).length;

  const matchingFlags = search
    ? ALL_FLAGS.filter(
        (f) =>
          f.includes(search.toLowerCase()) ||
          WHITELISTABLE_FEATURES_CONFIG[f].description
            .toLowerCase()
            .includes(search.toLowerCase())
      )
    : ALL_FLAGS;

  const sortedFlags = useMemo(() => {
    const overridden: WhitelistableFeature[] = [];
    const serverOn: WhitelistableFeature[] = [];
    const rest: WhitelistableFeature[] = [];
    for (const flag of matchingFlags) {
      if (flag in overrides) {
        overridden.push(flag);
      } else if (serverFlagSet.has(flag)) {
        serverOn.push(flag);
      } else {
        rest.push(flag);
      }
    }
    return { overridden, serverOn, rest };
  }, [matchingFlags, overrides, serverFlagSet]);

  const getState = useCallback(
    (flag: WhitelistableFeature): OverrideState => {
      if (flag in overrides) {
        return overrides[flag] ? "on" : "off";
      }
      return "default";
    },
    [overrides]
  );

  const isEffectivelyOn = useCallback(
    (flag: WhitelistableFeature): boolean => {
      const state = getState(flag);
      if (state === "on") {
        return true;
      }
      if (state === "off") {
        return false;
      }
      return serverFlagSet.has(flag);
    },
    [getState, serverFlagSet]
  );

  const setFlagState = useCallback(
    (flag: WhitelistableFeature, state: OverrideState) => {
      const next = { ...overrides };
      if (state === "default") {
        delete next[flag];
      } else {
        next[flag] = state === "on";
      }
      setOverrides(next);
      writeFeatureFlagOverrides(next);
    },
    [overrides]
  );

  const resetAll = useCallback(() => {
    setOverrides({});
    writeFeatureFlagOverrides({});
  }, []);

  function renderFlagRow(flag: WhitelistableFeature) {
    const state = getState(flag);
    const active = isEffectivelyOn(flag);
    const isServerOn = serverFlagSet.has(flag);
    return (
      <div key={flag} style={S.row}>
        <span style={S.badge(active)} />
        <div style={S.flagName}>
          <div>{flag}</div>
          <div style={S.flagDesc}>
            {WHITELISTABLE_FEATURES_CONFIG[flag].description}
            {isServerOn && (
              <span style={{ color: "#7fdbca", marginLeft: 4 }}>
                (server: on)
              </span>
            )}
          </div>
        </div>
        <div style={S.triToggle}>
          <button
            style={S.toggleBtn(active, "#7fdbca")}
            onClick={() =>
              setFlagState(flag, state === "on" ? "default" : "on")
            }
          >
            ON
          </button>
          <button
            style={S.toggleBtn(!active, "#ff6b6b")}
            onClick={() =>
              setFlagState(flag, state === "off" ? "default" : "off")
            }
          >
            OFF
          </button>
        </div>
      </div>
    );
  }

  function renderFlagSection(label: string, flags: WhitelistableFeature[]) {
    if (flags.length === 0) {
      return null;
    }
    return (
      <>
        <div style={S.sectionLabel}>{label}</div>
        {flags.map(renderFlagRow)}
      </>
    );
  }

  return (
    <>
      {/* Header */}
      <div style={S.panelHeader}>
        <span style={S.headerTitle}>Feature Flags</span>
        <button style={S.headerBtn} onClick={onClose} title="Close">
          {"✕"}
        </button>
      </div>
      <div
        style={{
          padding: "6px 12px",
          fontSize: 10,
          color: "#a1a1aa",
          borderBottom: "1px solid #2a2a4a",
          lineHeight: 1.4,
        }}
      >
        Frontend-only overrides stored in session storage. Cleared when the tab
        closes. Does not affect backend behavior.
      </div>

      {/* Feature flags */}
      <div style={S.search}>
        <input
          style={S.searchInput}
          placeholder="Search flags..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onMouseDown={(e) => e.stopPropagation()}
        />
      </div>
      <div style={S.list}>
        {renderFlagSection("Overrides", sortedFlags.overridden)}
        {renderFlagSection("Server enabled", sortedFlags.serverOn)}
        {renderFlagSection("All flags", sortedFlags.rest)}
        {matchingFlags.length === 0 && (
          <div
            style={{
              padding: "16px 12px",
              color: "#9ca3af",
              textAlign: "center" as const,
            }}
          >
            No flags match "{search}"
          </div>
        )}
      </div>
      <div style={S.footer}>
        <span>
          {matchingFlags.length} / {ALL_FLAGS.length} flags
        </span>
        {overrideCount > 0 && (
          <button style={S.resetBtn} onClick={resetAll}>
            Reset all
          </button>
        )}
      </div>
    </>
  );
}

// ── Docked toolbar ──

interface DockedToolbarProps {
  serverFlags: WhitelistableFeature[];
  metrics: PerfMetrics;
  onSwitchMode: () => void;
}

type ExpandedPanel = "flags" | "colors" | "typo" | null;

const DOCKED_PANEL_POS_KEY = "dust_dev_docked_panel_pos";

function readDockedPanelPosition(): { right: number; bottom: number } {
  try {
    const raw = localStorage.getItem(DOCKED_PANEL_POS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { right: parsed.right ?? 8, bottom: parsed.bottom ?? 33 };
    }
  } catch {
    // ignore
  }
  return { right: 8, bottom: 33 };
}

function DockedToolbar({
  serverFlags,
  metrics,
  onSwitchMode,
}: DockedToolbarProps) {
  const { theme, setTheme } = useTheme();
  const [expanded, setExpanded] = useState<ExpandedPanel>(null);
  const [panelPos, setPanelPos] = useState(readDockedPanelPosition);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origRight: number;
    origBottom: number;
  } | null>(null);
  const overrideCount = Object.keys(getFeatureFlagOverrides()).length;
  const colorOverrideCount = Object.keys(readColorOverrides()).length;
  const typoOverrideCount = countTypoOverrides(readTypoOverrides()) +
    (readFontFamilyOverrides().sans ? 1 : 0) +
    (readFontFamilyOverrides().mono ? 1 : 0);

  const togglePanel = useCallback(
    (panel: "flags" | "colors" | "typo") => {
      setExpanded(expanded === panel ? null : panel);
    },
    [expanded]
  );

  const onPanelMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origRight: panelPos.right,
        origBottom: panelPos.bottom,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) {
          return;
        }
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPanelPos({
          right: Math.max(0, dragRef.current.origRight - dx),
          bottom: Math.max(33, dragRef.current.origBottom - dy),
        });
      };

      const onMouseUp = () => {
        if (dragRef.current) {
          setPanelPos((pos) => {
            localStorage.setItem(DOCKED_PANEL_POS_KEY, JSON.stringify(pos));
            return pos;
          });
          dragRef.current = null;
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [panelPos]
  );

  return (
    <div style={S.docked}>
      <div style={S.dockedBar}>
        {/* Left: env + theme */}
        <div style={S.dockedSection}>
          <span style={{ color: "#7fdbca", fontWeight: 700, fontSize: 11 }}>
            {"Dev"}
          </span>
          <span style={S.dockedSep} />
          {THEME_OPTIONS.map((t) => (
            <button
              key={t}
              style={S.dockedBtn(theme === t)}
              onClick={() => setTheme(t)}
            >
              {t === "light" ? "☀" : t === "dark" ? "☾" : "◐"}
            </button>
          ))}
          <span style={S.dockedSep} />
          <button
            style={S.dockedTextBtn(expanded === "flags")}
            onClick={() => togglePanel("flags")}
          >
            Flags
            {overrideCount > 0 && (
              <span style={S.dockedBadge}>{overrideCount}</span>
            )}
          </button>
          <button
            style={S.dockedTextBtn(expanded === "colors")}
            onClick={() => togglePanel("colors")}
          >
            Colors
            {colorOverrideCount > 0 && (
              <span style={S.dockedBadge}>{colorOverrideCount}</span>
            )}
          </button>
          <button
            style={S.dockedTextBtn(expanded === "typo")}
            onClick={() => togglePanel("typo")}
          >
            Typo
            {typoOverrideCount > 0 && (
              <span style={S.dockedBadge}>{typoOverrideCount}</span>
            )}
          </button>
        </div>

        {/* Right: metrics + mode toggle */}
        <div style={S.dockedSection}>
          <PerfBar metrics={metrics} />
          <span style={S.dockedSep} />
          <button
            style={S.dockedIconBtn}
            onClick={onSwitchMode}
            title="Switch to floating mode"
          >
            {"↗"}
          </button>
          <button
            style={S.dockedIconBtn}
            onClick={() => {
              localStorage.removeItem(DEV_MODE_STORAGE_KEY);
              window.location.reload();
            }}
            title="Close dev console"
          >
            {"✕"}
          </button>
        </div>
      </div>

      {/* Expandable panels */}
      {expanded === "flags" && (
        <div
          style={{
            ...S.dockedPanel,
            right: panelPos.right,
            bottom: panelPos.bottom,
          }}
        >
          <div style={S.dockedPanelDragHandle} onMouseDown={onPanelMouseDown}>
            <span style={S.dockedPanelGrip}>{"⠿"}</span>
          </div>
          <PanelContent
            serverFlags={serverFlags}
            onClose={() => setExpanded(null)}
          />
        </div>
      )}
      {expanded === "colors" && (
        <div
          style={{
            ...S.dockedPanel,
            right: panelPos.right,
            bottom: panelPos.bottom,
          }}
        >
          <div style={S.dockedPanelDragHandle} onMouseDown={onPanelMouseDown}>
            <span style={S.dockedPanelGrip}>{"⠿"}</span>
          </div>
          <ColorOverridePanel onClose={() => setExpanded(null)} />
        </div>
      )}
      {expanded === "typo" && (
        <div
          style={{
            ...S.dockedPanel,
            right: panelPos.right,
            bottom: panelPos.bottom,
          }}
        >
          <div style={S.dockedPanelDragHandle} onMouseDown={onPanelMouseDown}>
            <span style={S.dockedPanelGrip}>{"⠿"}</span>
          </div>
          <TypoOverridePanel onClose={() => setExpanded(null)} />
        </div>
      )}
    </div>
  );
}

// ── Floating panel ──

interface FloatingPanelProps {
  serverFlags: WhitelistableFeature[];
  metrics: PerfMetrics;
  onSwitchMode: () => void;
}

function FloatingPanel({
  serverFlags,
  metrics,
  onSwitchMode,
}: FloatingPanelProps) {
  const { theme, setTheme } = useTheme();
  const [activePanel, setActivePanel] = useState<ExpandedPanel>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const overrideCount = Object.keys(getFeatureFlagOverrides()).length;
  const colorOverrideCount = Object.keys(readColorOverrides()).length;
  const typoOverrideCount = countTypoOverrides(readTypoOverrides()) +
    (readFontFamilyOverrides().sans ? 1 : 0) +
    (readFontFamilyOverrides().mono ? 1 : 0);

  const togglePanel = useCallback(
    (panel: "flags" | "colors" | "typo") => {
      setActivePanel(activePanel === panel ? null : panel);
    },
    [activePanel]
  );

  useLayoutEffect(() => {
    setPosition(readPosition());
    setInitialized(true);
  }, []);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: position.x,
        origY: position.y,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragRef.current) {
          return;
        }
        const dx = ev.clientX - dragRef.current.startX;
        const dy = ev.clientY - dragRef.current.startY;
        setPosition({
          x: Math.max(
            0,
            Math.min(window.innerWidth - 100, dragRef.current.origX + dx)
          ),
          y: Math.max(
            0,
            Math.min(window.innerHeight - 40, dragRef.current.origY + dy)
          ),
        });
      };

      const onMouseUp = () => {
        if (dragRef.current) {
          const el = panelRef.current;
          const finalPos = el
            ? {
                x: parseInt(el.style.left, 10) || position.x,
                y: parseInt(el.style.top, 10) || position.y,
              }
            : position;
          localStorage.setItem(PANEL_POS_KEY, JSON.stringify(finalPos));
          dragRef.current = null;
        }
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [position]
  );

  if (!initialized) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      style={{ ...S.floatPanel, left: position.x, top: position.y }}
    >
      {/* Draggable header bar with all controls */}
      <div style={S.floatHeader} onMouseDown={onMouseDown}>
        <div style={S.dockedSection}>
          <span style={{ color: "#7fdbca", fontWeight: 700, fontSize: 11 }}>
            {"Dev"}
          </span>
          <span style={S.dockedSep} />
          {THEME_OPTIONS.map((t) => (
            <button
              key={t}
              style={S.dockedBtn(theme === t)}
              onClick={() => setTheme(t)}
            >
              {t === "light" ? "☀" : "☾"}
            </button>
          ))}
          <span style={S.dockedSep} />
          <button
            style={S.dockedTextBtn(activePanel === "flags")}
            onClick={() => togglePanel("flags")}
          >
            Flags
            {overrideCount > 0 && (
              <span style={S.dockedBadge}>{overrideCount}</span>
            )}
          </button>
          <button
            style={S.dockedTextBtn(activePanel === "colors")}
            onClick={() => togglePanel("colors")}
          >
            Colors
            {colorOverrideCount > 0 && (
              <span style={S.dockedBadge}>{colorOverrideCount}</span>
            )}
          </button>
          <button
            style={S.dockedTextBtn(activePanel === "typo")}
            onClick={() => togglePanel("typo")}
          >
            Typo
            {typoOverrideCount > 0 && (
              <span style={S.dockedBadge}>{typoOverrideCount}</span>
            )}
          </button>
        </div>
        <div style={S.dockedSection}>
          <PerfBar metrics={metrics} />
          <span style={S.dockedSep} />
          <button
            style={S.dockedIconBtn}
            onClick={onSwitchMode}
            title="Switch to docked mode"
          >
            {"↙"}
          </button>
        </div>
      </div>

      {activePanel === "flags" && (
        <PanelContent
          serverFlags={serverFlags}
          onClose={() => setActivePanel(null)}
        />
      )}
      {activePanel === "colors" && (
        <ColorOverridePanel onClose={() => setActivePanel(null)} />
      )}
      {activePanel === "typo" && (
        <TypoOverridePanel onClose={() => setActivePanel(null)} />
      )}
    </div>
  );
}

// ── Root component ──

interface DevFeatureFlagPanelProps {
  serverFlags: WhitelistableFeature[];
}

const DOCK_BAR_HEIGHT = 33;

export function DevFeatureFlagPanel({ serverFlags }: DevFeatureFlagPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [dockMode, setDockMode] = useState<DockMode>("docked");
  const metrics = useDevPerf();

  useEffect(() => {
    setDockMode(readDockMode());
    setMounted(true);
    // Restore overrides on mount so they persist across navigations.
    injectColorStyles(readColorOverrides());
    injectTypoStyles(readTypoOverrides());
    injectFontFamilyStyles(readFontFamilyOverrides());
  }, []);

  // Reserve space at the bottom of the page when docked.
  useEffect(() => {
    if (dockMode === "docked") {
      document.documentElement.style.paddingBottom = `${DOCK_BAR_HEIGHT}px`;
    } else {
      document.documentElement.style.paddingBottom = "";
    }
    return () => {
      document.documentElement.style.paddingBottom = "";
    };
  }, [dockMode]);

  const switchMode = useCallback(() => {
    const next = dockMode === "docked" ? "floating" : "docked";
    setDockMode(next);
    localStorage.setItem(DOCK_MODE_KEY, next);
  }, [dockMode]);

  if (!mounted) {
    return null;
  }

  return createPortal(
    dockMode === "docked" ? (
      <DockedToolbar
        serverFlags={serverFlags}
        metrics={metrics}
        onSwitchMode={switchMode}
      />
    ) : (
      <FloatingPanel
        serverFlags={serverFlags}
        metrics={metrics}
        onSwitchMode={switchMode}
      />
    ),
    document.body
  );
}

// ── Styles ──

const S = {
  // Docked bottom bar
  docked: {
    position: "fixed" as const,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 2147483647,
    fontFamily: FONT,
    fontSize: 12,
    color: "#e0e0e0",
    userSelect: "none" as const,
  },
  dockedBar: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: "4px 12px",
    background: "#111827",
    borderTop: "1px solid #333",
    minHeight: 32,
  },
  dockedSection: {
    display: "flex" as const,
    alignItems: "center" as const,
    gap: 6,
  },
  dockedSep: {
    width: 1,
    height: 14,
    background: "#333",
    display: "inline-block" as const,
    margin: "0 2px",
  },
  dockedBtn: (active: boolean) => ({
    padding: "2px 6px",
    fontSize: 12,
    border: "none",
    borderRadius: 3,
    cursor: "pointer" as const,
    background: active ? "#ffffff22" : "transparent",
    color: active ? "#fff" : "#9ca3af",
  }),
  dockedTextBtn: (active: boolean) => ({
    padding: "2px 8px",
    fontSize: 11,
    border: active ? "1px solid #7fdbca" : "1px solid transparent",
    borderRadius: 4,
    cursor: "pointer" as const,
    background: active ? "#7fdbca22" : "transparent",
    color: active ? "#7fdbca" : "#b0b0b8",
    fontWeight: 500,
    display: "inline-flex" as const,
    alignItems: "center" as const,
    gap: 4,
  }),
  dockedIconBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    cursor: "pointer" as const,
    fontSize: 13,
    padding: "2px 4px",
    borderRadius: 3,
    lineHeight: 1,
  },
  dockedBadge: {
    background: "#ff6b6b",
    color: "#fff",
    borderRadius: 10,
    padding: "0 5px",
    fontSize: 9,
    fontWeight: 700,
    lineHeight: "14px",
  },
  dockedPanel: {
    position: "fixed" as const,
    width: 380,
    maxHeight: "70vh",
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: "10px 10px 0 0",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden" as const,
    zIndex: 2147483647,
  },
  dockedPanelDragHandle: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: "2px 0",
    cursor: "grab" as const,
    background: "#111827",
    borderBottom: "1px solid #2a2a4a",
    flexShrink: 0,
  },
  dockedPanelGrip: {
    fontSize: 12,
    color: "#555",
    lineHeight: 1,
    letterSpacing: 2,
  },

  // Floating panel
  floatPanel: {
    position: "fixed" as const,
    zIndex: 2147483647,
    minWidth: 500,
    maxHeight: "80vh",
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
    fontFamily: FONT,
    fontSize: 12,
    color: "#e0e0e0",
    display: "flex" as const,
    flexDirection: "column" as const,
    userSelect: "none" as const,
    overflow: "hidden" as const,
  },
  floatHeader: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: "6px 12px",
    background: "#111827",
    cursor: "grab" as const,
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },

  // Shared panel internals
  panelHeader: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    padding: "8px 12px",
    background: "#16213e",
    borderBottom: "1px solid #333",
    flexShrink: 0,
  },
  headerTitle: {
    fontWeight: 700,
    fontSize: 13,
    color: "#7fdbca",
  },
  headerBtn: {
    background: "none",
    border: "none",
    color: "#a1a1aa",
    cursor: "pointer" as const,
    fontSize: 16,
    padding: "2px 6px",
    borderRadius: 4,
    lineHeight: 1,
  },
  toolbar: {
    padding: "8px 12px",
    borderBottom: "1px solid #333",
    display: "flex" as const,
    flexDirection: "column" as const,
    gap: 6,
    flexShrink: 0,
  },
  toolbarRow: {
    display: "flex" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
  },
  toolbarLabel: {
    fontSize: 11,
    color: "#b0b0b8",
  },
  btnGroup: {
    display: "flex" as const,
    gap: 2,
  },
  toolbarBtn: (active: boolean) => ({
    padding: "3px 10px",
    fontSize: 10,
    fontWeight: active ? 700 : 400,
    border: active ? "1px solid #7fdbca" : "1px solid #555",
    borderRadius: 4,
    cursor: "pointer" as const,
    background: active ? "#7fdbca88" : "transparent",
    color: active ? "#fff" : "#9ca3af",
  }),
  search: {
    padding: "8px 12px",
    borderBottom: "1px solid #2a2a4a",
    flexShrink: 0,
  },
  searchInput: {
    width: "100%",
    background: "#0f0f23",
    border: "1px solid #555",
    borderRadius: 6,
    padding: "6px 10px",
    color: "#e0e0e0",
    fontSize: 12,
    outline: "none",
  },
  list: {
    overflowY: "auto" as const,
    flex: 1,
    padding: "4px 0",
  },
  row: {
    display: "flex" as const,
    alignItems: "center" as const,
    padding: "5px 12px",
    gap: 8,
    borderBottom: "1px solid #1a1a3a",
  },
  flagName: {
    flex: 1,
    fontSize: 11,
    wordBreak: "break-all" as const,
    lineHeight: 1.3,
  },
  flagDesc: {
    fontSize: 10,
    color: "#a1a1aa",
    marginTop: 2,
  },
  triToggle: {
    display: "flex" as const,
    gap: 2,
    flexShrink: 0,
  },
  toggleBtn: (active: boolean, color: string) => ({
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: active ? 700 : 400,
    border: active ? `1px solid ${color}` : "1px solid #555",
    borderRadius: 4,
    cursor: "pointer" as const,
    background: active ? `${color}88` : "transparent",
    color: active ? "#fff" : "#9ca3af",
  }),
  badge: (active: boolean) => ({
    display: "inline-block" as const,
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: active ? "#7fdbca" : "transparent",
    marginRight: 4,
    flexShrink: 0,
  }),
  sectionLabel: {
    padding: "6px 12px 4px",
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
    color: "#9ca3af",
    borderBottom: "1px solid #1a1a3a",
  },
  footer: {
    padding: "6px 12px",
    borderTop: "1px solid #333",
    display: "flex" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    fontSize: 10,
    color: "#9ca3af",
    flexShrink: 0,
  },
  resetBtn: {
    background: "none",
    border: "1px solid #555",
    color: "#ff6b6b",
    cursor: "pointer" as const,
    fontSize: 10,
    padding: "2px 8px",
    borderRadius: 4,
  },
} as const;

// ── Console helpers (window.ff) ──
// Registered once when this lazy chunk loads (dev mode is always active here).

(window as unknown as Record<string, unknown>).ff = {
  enable(flag: string) {
    if (!isWhitelistableFeature(flag)) {
      throw new Error(`Unknown feature flag: "${flag}"`);
    }
    const overrides = getFeatureFlagOverrides();
    overrides[flag] = true;
    writeFeatureFlagOverrides(overrides);
    return `Enabled "${flag}". Applied immediately.`;
  },
  disable(flag: string) {
    if (!isWhitelistableFeature(flag)) {
      throw new Error(`Unknown feature flag: "${flag}"`);
    }
    const overrides = getFeatureFlagOverrides();
    overrides[flag] = false;
    writeFeatureFlagOverrides(overrides);
    return `Disabled "${flag}". Applied immediately.`;
  },
  reset(flag?: string) {
    if (flag) {
      if (!isWhitelistableFeature(flag)) {
        throw new Error(`Unknown feature flag: "${flag}"`);
      }
      const overrides = getFeatureFlagOverrides();
      delete overrides[flag];
      writeFeatureFlagOverrides(overrides);
      return `Reset override for "${flag}".`;
    }
    writeFeatureFlagOverrides({});
    return "All feature flag overrides cleared.";
  },
  list() {
    return getFeatureFlagOverrides();
  },
};
