import {
  applyDocumentAttribute,
  buildPreferenceInitScript,
  PreferenceInitScript,
  usePersistedUserPreference,
} from "@app/components/sparkle/persistedUserPreference";
import { createContext, useContext, useMemo } from "react";

/**
 * Accent color (Settings > Customization): which palette scale the
 * `highlight` tokens map to. Blue is Dust's default and needs no attribute;
 * the others are applied as `data-accent` on <html>, which `tokens.css`
 * turns into a remap of highlight-50..950 (mirrored in dark mode).
 */
export const ACCENT_COLORS = [
  "blue",
  "violet",
  "pink",
  "rose",
  "red",
  "orange",
  "golden",
  "lime",
  "green",
  "emerald",
] as const;
export type AccentColor = (typeof ACCENT_COLORS)[number];

export const ACCENT_COLOR_LABELS: Record<AccentColor, string> = {
  blue: "Blue",
  violet: "Violet",
  pink: "Pink",
  rose: "Rose",
  red: "Red",
  orange: "Orange",
  golden: "Golden",
  lime: "Lime",
  green: "Green",
  emerald: "Emerald",
};

export const DEFAULT_ACCENT_COLOR: AccentColor = "blue";
export const ACCENT_COLOR_METADATA_KEY = "accent_color";
const STORAGE_KEY = "accentColor";
const DATA_ATTRIBUTE = "data-accent";

export function isAccentColor(
  value: string | null | undefined
): value is AccentColor {
  return typeof value === "string" && ACCENT_COLORS.some((c) => c === value);
}

export function applyAccentColor(color: AccentColor): void {
  applyDocumentAttribute(DATA_ATTRIBUTE, color, DEFAULT_ACCENT_COLOR);
}

const initScript = buildPreferenceInitScript({
  storageKey: STORAGE_KEY,
  attribute: DATA_ATTRIBUTE,
  values: ACCENT_COLORS.filter((c) => c !== DEFAULT_ACCENT_COLOR),
});

interface AccentColorContextType {
  accentColor: AccentColor;
  // Resolves to false when the server save failed (the color still applies
  // locally); callers surface that to the user.
  setAccentColor: (color: AccentColor) => Promise<boolean>;
}

const AccentColorContext = createContext<AccentColorContextType | undefined>(
  undefined
);

export function AccentColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { value, setValue } = usePersistedUserPreference<AccentColor>({
    metadataKey: ACCENT_COLOR_METADATA_KEY,
    storageKey: STORAGE_KEY,
    defaultValue: DEFAULT_ACCENT_COLOR,
    isValid: isAccentColor,
    apply: applyAccentColor,
    label: "accent color",
  });

  const contextValue = useMemo(
    () => ({ accentColor: value, setAccentColor: setValue }),
    [value, setValue]
  );

  return (
    <AccentColorContext.Provider value={contextValue}>
      <PreferenceInitScript script={initScript} />
      {children}
    </AccentColorContext.Provider>
  );
}

export const useAccentColor = () => {
  const context = useContext(AccentColorContext);
  if (!context) {
    throw new Error("useAccentColor must be used within AccentColorProvider");
  }
  return context;
};
