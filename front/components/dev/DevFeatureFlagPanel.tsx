import {
  isWhitelistableFeature,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { ColorOverridePanel } from "./ColorOverridePanel";
import {
  getFeatureFlagOverrides,
  writeFeatureFlagOverrides,
} from "./devFeatureFlagOverrides";
import {
  DOCK_BAR_HEIGHT,
  type DockMode,
  type ExpandedPanel,
} from "./devModeConfig";
import { DEV_MODE_STORAGE_KEY } from "./devModeConstants";
import { S } from "./devPanelStyles";
import {
  DOCK_MODE_KEY,
  DOCKED_PANEL_POS_KEY,
  injectColorStyles,
  injectFontFamilyStyles,
  injectTypoStyles,
  PANEL_POS_KEY,
  readColorOverrides,
  readDockedPanelPosition,
  readDockMode,
  readFontFamilyOverrides,
  readPosition,
  readTypoOverrides,
} from "./devStyleOverrides";
import { FeatureFlagPanel } from "./FeatureFlagPanel";
import { ToolbarControls } from "./ToolbarControls";
import { TypoOverridePanel } from "./TypoOverridePanel";
import { useDevPerf } from "./useDevPerf";
import { useDrag } from "./useDrag";

// ── Docked toolbar ──

interface DockedToolbarProps {
  serverFlags: WhitelistableFeature[];
  onSwitchMode: () => void;
}

function DockedToolbar({ serverFlags, onSwitchMode }: DockedToolbarProps) {
  const [expanded, setExpanded] = useState<ExpandedPanel>(null);
  const [panelPos, setPanelPos] = useState(readDockedPanelPosition);
  const origPosRef = useRef(panelPos);
  const metrics = useDevPerf();

  const togglePanel = useCallback(
    (panel: "flags" | "colors" | "typo") => {
      setExpanded(expanded === panel ? null : panel);
    },
    [expanded]
  );

  const { onMouseDown: onPanelMouseDown } = useDrag({
    onDrag: useCallback(({ dx, dy }: { dx: number; dy: number }) => {
      setPanelPos({
        right: Math.max(0, origPosRef.current.right - dx),
        bottom: Math.max(33, origPosRef.current.bottom - dy),
      });
    }, []),
    onDragEnd: useCallback(() => {
      setPanelPos((pos) => {
        origPosRef.current = pos;
        localStorage.setItem(DOCKED_PANEL_POS_KEY, JSON.stringify(pos));
        return pos;
      });
    }, []),
  });

  return (
    <div style={S.docked}>
      <div style={S.dockedBar}>
        <ToolbarControls
          metrics={metrics}
          expanded={expanded}
          onTogglePanel={togglePanel}
        />
        <div style={S.dockedSection}>
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

      {expanded && (
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
          {expanded === "flags" && (
            <FeatureFlagPanel
              serverFlags={serverFlags}
              onClose={() => setExpanded(null)}
            />
          )}
          {expanded === "colors" && (
            <ColorOverridePanel onClose={() => setExpanded(null)} />
          )}
          {expanded === "typo" && (
            <TypoOverridePanel onClose={() => setExpanded(null)} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Floating panel ──

interface FloatingPanelProps {
  serverFlags: WhitelistableFeature[];
  onSwitchMode: () => void;
}

function FloatingPanel({ serverFlags, onSwitchMode }: FloatingPanelProps) {
  const [activePanel, setActivePanel] = useState<ExpandedPanel>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const origPosRef = useRef(position);
  const panelRef = useRef<HTMLDivElement>(null);
  const metrics = useDevPerf();

  const togglePanel = useCallback(
    (panel: "flags" | "colors" | "typo") => {
      setActivePanel(activePanel === panel ? null : panel);
    },
    [activePanel]
  );

  useLayoutEffect(() => {
    const pos = readPosition();
    setPosition(pos);
    origPosRef.current = pos;
    setInitialized(true);
  }, []);

  const { onMouseDown } = useDrag({
    onDrag: useCallback(({ dx, dy }: { dx: number; dy: number }) => {
      setPosition({
        x: Math.max(
          0,
          Math.min(window.innerWidth - 100, origPosRef.current.x + dx)
        ),
        y: Math.max(
          0,
          Math.min(window.innerHeight - 40, origPosRef.current.y + dy)
        ),
      });
    }, []),
    onDragEnd: useCallback(() => {
      setPosition((pos) => {
        origPosRef.current = pos;
        localStorage.setItem(PANEL_POS_KEY, JSON.stringify(pos));
        return pos;
      });
    }, []),
  });

  if (!initialized) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      style={{ ...S.floatPanel, left: position.x, top: position.y }}
    >
      <div style={S.floatHeader} onMouseDown={onMouseDown}>
        <ToolbarControls
          metrics={metrics}
          expanded={activePanel}
          onTogglePanel={togglePanel}
        />
        <div style={S.dockedSection}>
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
        <FeatureFlagPanel
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

export function DevFeatureFlagPanel({ serverFlags }: DevFeatureFlagPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [dockMode, setDockMode] = useState<DockMode>("docked");

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
      <DockedToolbar serverFlags={serverFlags} onSwitchMode={switchMode} />
    ) : (
      <FloatingPanel serverFlags={serverFlags} onSwitchMode={switchMode} />
    ),
    document.body
  );
}

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
