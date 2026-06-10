import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { ReactNode } from "react";

import { getFeatureFlagOverrides } from "./devFeatureFlagOverrides";
import { type ExpandedPanel, THEME_OPTIONS } from "./devModeConfig";
import { S } from "./devPanelStyles";
import {
  countTypoOverrides,
  readColorOverrides,
  readFontFamilyOverrides,
  readTypoOverrides,
} from "./devStyleOverrides";
import { PerfBar } from "./PerfBar";
import type { PerfMetrics } from "./useDevPerf";

interface ToolbarControlsProps {
  metrics: PerfMetrics;
  expanded: ExpandedPanel;
  onTogglePanel: (panel: "flags" | "colors" | "typo") => void;
  actions?: ReactNode;
  compact?: boolean;
}

export function ToolbarControls({
  metrics,
  expanded,
  onTogglePanel,
  actions,
  compact,
}: ToolbarControlsProps) {
  const { theme, setTheme } = useTheme();
  const overrideCount = Object.keys(getFeatureFlagOverrides()).length;
  const colorOverrideCount = Object.keys(readColorOverrides()).length;
  const fontFamilyOverrides = readFontFamilyOverrides();
  const typoOverrideCount =
    countTypoOverrides(readTypoOverrides()) +
    (fontFamilyOverrides.sans ? 1 : 0) +
    (fontFamilyOverrides.mono ? 1 : 0);

  return (
    <>
      <div style={S.dockedSection}>
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
          style={S.dockedTextBtn(expanded === "flags")}
          onClick={() => onTogglePanel("flags")}
        >
          {compact ? "F" : "Flags"}
          {overrideCount > 0 && (
            <span style={S.dockedBadge}>{overrideCount}</span>
          )}
        </button>
        <button
          style={S.dockedTextBtn(expanded === "colors")}
          onClick={() => onTogglePanel("colors")}
        >
          {compact ? "C" : "Colors"}
          {colorOverrideCount > 0 && (
            <span style={S.dockedBadge}>{colorOverrideCount}</span>
          )}
        </button>
        <button
          style={S.dockedTextBtn(expanded === "typo")}
          onClick={() => onTogglePanel("typo")}
        >
          {compact ? "T" : "Typography"}
          {typoOverrideCount > 0 && (
            <span style={S.dockedBadge}>{typoOverrideCount}</span>
          )}
        </button>
      </div>

      <div style={S.dockedSection}>
        <PerfBar metrics={metrics} compact={compact} />
        {actions && (
          <>
            <span style={S.dockedSep} />
            {actions}
          </>
        )}
      </div>
    </>
  );
}
