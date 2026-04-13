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

type ExpandedPanel = "flags" | "colors" | null;

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

  const togglePanel = useCallback(
    (panel: "flags" | "colors") => {
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

  const togglePanel = useCallback(
    (panel: "flags" | "colors") => {
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
    // Restore color overrides on mount so they persist across navigations.
    injectColorStyles(readColorOverrides());
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
    fontWeight: active ? 700 : 400,
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
