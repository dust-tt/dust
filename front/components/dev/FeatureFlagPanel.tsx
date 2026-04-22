import {
  WHITELISTABLE_FEATURES_CONFIG,
  type WhitelistableFeature,
} from "@app/types/shared/feature_flags";
import { useCallback, useMemo, useState } from "react";
import {
  getFeatureFlagOverrides,
  writeFeatureFlagOverrides,
} from "./devFeatureFlagOverrides";
import type { OverrideState } from "./devModeConfig";
import { S } from "./devPanelStyles";

const ALL_FLAGS = Object.keys(
  WHITELISTABLE_FEATURES_CONFIG
).sort() as WhitelistableFeature[];

interface FeatureFlagPanelProps {
  serverFlags: WhitelistableFeature[];
  onClose: () => void;
}

export function FeatureFlagPanel({
  serverFlags,
  onClose,
}: FeatureFlagPanelProps) {
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
