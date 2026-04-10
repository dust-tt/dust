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
  label: string;
  description: string;
  defaultLight: string;
  defaultDark: string;
  /** CSS property prefixes to override (bg, text, border). */
  properties: ("bg" | "text" | "border")[];
  /** Whether this token has shade variants (50–950). */
  hasShades: boolean;
}

type ColorTokenName =
  | "background"
  | "foreground"
  | "muted-bg"
  | "muted-text"
  | "primary-bg"
  | "primary-text"
  | "highlight"
  | "border";

// Tokens where the semantic name differs from the key (split tokens).
// e.g. "primary-bg" still targets classes named "primary", not "primary-bg".
const TOKEN_SEMANTIC_NAME: Partial<Record<ColorTokenName, string>> = {
  "muted-bg": "muted",
  "muted-text": "muted",
  "primary-bg": "primary",
  "primary-text": "primary",
};

const COLOR_TOKENS: Record<ColorTokenName, ColorToken> = {
  background: {
    label: "Background",
    description: "Page background",
    defaultLight: "#FFFFFF",
    defaultDark: "#111418",
    properties: ["bg"],
    hasShades: false,
  },
  foreground: {
    label: "Foreground",
    description: "Primary text color",
    defaultLight: "#111418",
    defaultDark: "#D3D5D9",
    properties: ["text"],
    hasShades: false,
  },
  "muted-bg": {
    label: "Muted BG",
    description: "Subtle backgrounds (bg-muted)",
    defaultLight: "#F7F7F7",
    defaultDark: "#111418",
    properties: ["bg"],
    hasShades: false,
  },
  "muted-text": {
    label: "Muted Text",
    description: "Secondary text (text-muted)",
    defaultLight: "#596170",
    defaultDark: "#969CA5",
    properties: ["text"],
    hasShades: false,
  },
  "primary-bg": {
    label: "Primary BG",
    description: "Primary surfaces (bg-primary)",
    defaultLight: "#2A3241",
    defaultDark: "#D3D5D9",
    properties: ["bg"],
    hasShades: true,
  },
  "primary-text": {
    label: "Primary Text",
    description: "Primary text (text-primary)",
    defaultLight: "#2A3241",
    defaultDark: "#D3D5D9",
    properties: ["text"],
    hasShades: true,
  },
  highlight: {
    label: "Highlight",
    description: "Accent / links / actions",
    defaultLight: "#1C91FF",
    defaultDark: "#1C91FF",
    properties: ["bg", "text", "border"],
    hasShades: true,
  },
  border: {
    label: "Border",
    description: "Default border color",
    defaultLight: "#EEEEEF",
    defaultDark: "#2A3241",
    properties: ["border"],
    hasShades: false,
  },
};

const SHADE_SUFFIXES = [
  "",
  "-50",
  "-100",
  "-150",
  "-200",
  "-300",
  "-400",
  "-500",
  "-600",
  "-700",
  "-800",
  "-850",
  "-900",
  "-950",
];
const VARIANT_SUFFIXES = [
  "",
  "-light",
  "-dark",
  "-muted",
  "-foreground",
  "-background",
];

const ALL_TOKEN_NAMES = Object.keys(COLOR_TOKENS) as ColorTokenName[];

type ColorOverrides = Partial<Record<ColorTokenName, string>>;

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

  for (const [tokenName, color] of Object.entries(overrides)) {
    const token = COLOR_TOKENS[tokenName as ColorTokenName];
    if (!token || !color) {
      continue;
    }

    const semanticName =
      TOKEN_SEMANTIC_NAME[tokenName as ColorTokenName] ?? tokenName;

    const suffixes = token.hasShades
      ? [...SHADE_SUFFIXES, ...VARIANT_SUFFIXES]
      : [...VARIANT_SUFFIXES];

    for (const prop of token.properties) {
      const cssProperty = CSS_PROPERTY_MAP[prop];
      for (const suffix of suffixes) {
        const className = `${prop}-${semanticName}${suffix}`;
        // Unprefixed (front's own Tailwind classes)
        rules.push(`.${className} { ${cssProperty}: ${color} !important; }`);
        rules.push(
          `.dark .${className}-night { ${cssProperty}: ${color} !important; }`
        );
        // s-prefixed (Sparkle design system classes)
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

function ColorOverridePanel({ onClose }: ColorOverridePanelProps) {
  const { theme } = useTheme();
  const [overrides, setOverrides] =
    useState<ColorOverrides>(readColorOverrides);
  const overrideCount = Object.keys(overrides).length;

  // Restore injected styles on mount (in case of re-render).
  useEffect(() => {
    injectColorStyles(readColorOverrides());
  }, []);

  const setColor = useCallback(
    (token: ColorTokenName, color: string) => {
      const next = { ...overrides, [token]: color };
      setOverrides(next);
      writeColorOverrides(next);
    },
    [overrides]
  );

  const clearColor = useCallback(
    (token: ColorTokenName) => {
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

  const isDark = theme === "dark";

  return (
    <>
      <div style={S.panelHeader}>
        <span style={S.headerTitle}>Color Overrides</span>
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
        Override semantic color tokens via style injection. Changes are stored
        in session storage and cleared when the tab closes.
      </div>
      <div style={{ ...S.list, padding: "4px 0" }}>
        {ALL_TOKEN_NAMES.map((tokenName) => {
          const token = COLOR_TOKENS[tokenName];
          const currentOverride = overrides[tokenName];
          const defaultColor = isDark ? token.defaultDark : token.defaultLight;

          return (
            <div key={tokenName} style={{ ...S.row, gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {token.label}
                </div>
                <div style={S.flagDesc}>{token.description}</div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: 0,
                }}
              >
                <button
                  style={{
                    background: "none",
                    border: "none",
                    color: currentOverride ? "#ff6b6b" : "transparent",
                    cursor: currentOverride ? "pointer" : "default",
                    fontSize: 14,
                    padding: "0 2px",
                    lineHeight: 1,
                    width: 18,
                    flexShrink: 0,
                  }}
                  onClick={() => {
                    if (currentOverride) {
                      clearColor(tokenName);
                    }
                  }}
                  title={currentOverride ? "Reset to default" : undefined}
                >
                  {"✕"}
                </button>
                <input
                  type="text"
                  value={currentOverride ?? defaultColor}
                  placeholder={defaultColor}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                      setColor(tokenName, v);
                    }
                  }}
                  onBlur={(e) => {
                    let v = e.target.value.trim();
                    // Auto-prepend # if missing.
                    if (/^[0-9a-fA-F]{6}$/.test(v)) {
                      v = `#${v}`;
                    }
                    if (/^#[0-9a-fA-F]{6}$/.test(v)) {
                      setColor(tokenName, v);
                    }
                  }}
                  onMouseDown={(e) => e.stopPropagation()}
                  style={{
                    width: 72,
                    fontSize: 11,
                    fontFamily: "monospace",
                    color: "#e0e0e0",
                    background: "#0f0f23",
                    border: "1px solid #555",
                    borderRadius: 4,
                    padding: "3px 6px",
                    outline: "none",
                    textAlign: "center" as const,
                  }}
                />
                <label
                  style={{
                    position: "relative",
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: currentOverride
                      ? "2px solid #7fdbca"
                      : "2px solid #555",
                    overflow: "hidden",
                    cursor: "pointer",
                    background: currentOverride ?? defaultColor,
                    flexShrink: 0,
                  }}
                >
                  <input
                    type="color"
                    value={currentOverride ?? defaultColor}
                    onChange={(e) => setColor(tokenName, e.target.value)}
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
              </div>
            </div>
          );
        })}
      </div>
      <div style={S.footer}>
        <span>
          {overrideCount} override{overrideCount !== 1 ? "s" : ""}
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

function DockedToolbar({
  serverFlags,
  metrics,
  onSwitchMode,
}: DockedToolbarProps) {
  const { theme, setTheme } = useTheme();
  const [expanded, setExpanded] = useState<ExpandedPanel>(null);
  const overrideCount = Object.keys(getFeatureFlagOverrides()).length;
  const colorOverrideCount = Object.keys(readColorOverrides()).length;

  const togglePanel = useCallback(
    (panel: "flags" | "colors") => {
      setExpanded(expanded === panel ? null : panel);
    },
    [expanded]
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
        <div style={S.dockedPanel}>
          <PanelContent
            serverFlags={serverFlags}
            onClose={() => setExpanded(null)}
          />
        </div>
      )}
      {expanded === "colors" && (
        <div style={S.dockedPanel}>
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
    position: "absolute" as const,
    bottom: 33,
    right: 8,
    width: 380,
    maxHeight: "70vh",
    background: "#1a1a2e",
    border: "1px solid #333",
    borderRadius: "10px 10px 0 0",
    boxShadow: "0 -8px 32px rgba(0,0,0,0.5)",
    display: "flex" as const,
    flexDirection: "column" as const,
    overflow: "hidden" as const,
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
