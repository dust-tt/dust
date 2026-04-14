import { useCallback, useEffect, useRef, useState } from "react";

import {
  type FontFamilyOverrides,
  POPULAR_FONTS,
  POPULAR_MONO_FONTS,
  TYPO_GROUPS,
  TYPO_PROP_LABELS,
  TYPO_PROPS,
  type TypoOverrides,
  type TypoProp,
  type TypoToken,
  type TypoTokenOverride,
} from "./devModeConfig";
import { S } from "./devPanelStyles";
import {
  countTypoOverrides,
  injectFontFamilyStyles,
  injectTypoStyles,
  readFontFamilyOverrides,
  readTypoOverrides,
  writeFontFamilyOverrides,
  writeTypoOverrides,
} from "./devStyleOverrides";

// ── Typography property input ──

interface TypoPropInputProps {
  prop: TypoProp;
  value: string | undefined;
  defaultValue: string;
  onChange: (value: string) => void;
  onClear: () => void;
}

function TypoPropInput({
  prop,
  value,
  defaultValue,
  onChange,
  onClear,
}: TypoPropInputProps) {
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
          color: "#d1d5db",
          width: 16,
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
          border: isOverridden ? "1px solid #7fdbca55" : "1px solid #333",
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

// ── Typography token row ──

interface TypoTokenRowProps {
  token: TypoToken;
  override: TypoTokenOverride | undefined;
  onSetProp: (tokenLabel: string, prop: TypoProp, value: string) => void;
  onClearProp: (tokenLabel: string, prop: TypoProp) => void;
  onClearAll: (tokenLabel: string) => void;
}

function TypoTokenRow({
  token,
  override,
  onSetProp,
  onClearProp,
  onClearAll,
}: TypoTokenRowProps) {
  const hasOverrides = override && Object.keys(override).length > 0;

  return (
    <div
      style={{
        padding: "5px 12px 5px 24px",
        borderBottom: "1px solid #1a1a3a",
      }}
    >
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

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 4,
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

// ── Font family section ──

interface FontFamilySectionProps {
  fontOverrides: FontFamilyOverrides;
  onUpdate: (overrides: FontFamilyOverrides) => void;
}

function FontFamilySection({
  fontOverrides,
  onUpdate,
}: FontFamilySectionProps) {
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
            debouncedUpdateSans(e.target.value.trim() || undefined);
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
            debouncedUpdateMono(e.target.value.trim() || undefined);
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

// ── Main panel ──

interface TypoOverridePanelProps {
  onClose: () => void;
}

export function TypoOverridePanel({ onClose }: TypoOverridePanelProps) {
  const [overrides, setOverrides] = useState<TypoOverrides>(readTypoOverrides);
  const [fontOverrides, setFontOverrides] = useState<FontFamilyOverrides>(
    readFontFamilyOverrides
  );
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const overrideCount = countTypoOverrides(overrides);
  const fontOverrideCount =
    (fontOverrides.sans ? 1 : 0) + (fontOverrides.mono ? 1 : 0);

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
              overrides[t.label] && Object.keys(overrides[t.label]).length > 0
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
