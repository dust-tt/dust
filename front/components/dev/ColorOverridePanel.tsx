import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useCallback, useEffect, useState } from "react";

import { ALL_TOKENS, COLOR_GROUPS, type ColorToken } from "./devModeConfig";
import { S } from "./devPanelStyles";
import {
  type ColorOverrides,
  injectColorStyles,
  readColorOverrides,
  writeColorOverrides,
} from "./devStyleOverrides";

interface ColorTokenRowProps {
  tokenKey: string;
  token: ColorToken;
  override: string | undefined;
  isDark: boolean;
  onSet: (key: string, color: string) => void;
  onClear: (key: string) => void;
}

function ColorTokenRow({
  tokenKey,
  token,
  override,
  isDark,
  onSet,
  onClear,
}: ColorTokenRowProps) {
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

interface ColorOverridePanelProps {
  onClose: () => void;
}

export function ColorOverridePanel({ onClose }: ColorOverridePanelProps) {
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

  const toggleGroup = useCallback((label: string) => {
    setCollapsed((prev) => ({ ...prev, [label]: !prev[label] }));
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

      <div style={{ ...S.list, padding: 0 }}>
        {COLOR_GROUPS.map((group) => {
          const tokenEntries = Object.entries(group.tokens);
          const groupOverrideCount = tokenEntries.filter(
            ([key]) => key in overrides
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
              Reset all
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
          {copied ? "Copied!" : "Copy all"}
        </button>
      </div>
    </>
  );
}
