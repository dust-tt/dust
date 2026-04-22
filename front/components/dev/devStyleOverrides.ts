// Storage read/write and CSS injection for color, typography, and font-family overrides.
// No React imports, no side effects at module scope.

import {
  ALL_TOKENS,
  ALL_TYPO_TOKENS,
  type FontFamilyOverrides,
  TYPO_PROP_CSS,
  type TypoOverrides,
  type TypoProp,
} from "./devModeConfig";

const COLOR_OVERRIDES_KEY = "dust_color_overrides";
const COLOR_STYLE_ID = "dust-dev-color-overrides";

const TYPO_OVERRIDES_KEY = "dust_typo_overrides";
const TYPO_STYLE_ID = "dust-dev-typo-overrides";

const FONT_FAMILY_OVERRIDES_KEY = "dust_font_family_overrides";
const FONT_FAMILY_STYLE_ID = "dust-dev-font-family-overrides";
const FONT_FAMILY_LINK_ID = "dust-dev-google-font";

export const PANEL_POS_KEY = "dust_dev_panel_pos";
export const DOCK_MODE_KEY = "dust_dev_dock_mode";
export const DOCKED_PANEL_POS_KEY = "dust_dev_docked_panel_pos";

export type ColorOverrides = Record<string, string>;

const CSS_PROPERTY_MAP: Record<string, string> = {
  bg: "background-color",
  text: "color",
  border: "border-color",
};

export function readColorOverrides(): ColorOverrides {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(COLOR_OVERRIDES_KEY) ?? "{}"
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const overrides: ColorOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string") {
        overrides[key] = value;
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

export function writeColorOverrides(overrides: ColorOverrides): void {
  if (Object.keys(overrides).length === 0) {
    sessionStorage.removeItem(COLOR_OVERRIDES_KEY);
  } else {
    sessionStorage.setItem(COLOR_OVERRIDES_KEY, JSON.stringify(overrides));
  }
  injectColorStyles(overrides);
}

export function injectColorStyles(overrides: ColorOverrides): void {
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
  const variantSuffixes = [
    "",
    "-light",
    "-dark",
    "-muted",
    "-foreground",
    "-background",
  ];

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

export function readTypoOverrides(): TypoOverrides {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(TYPO_OVERRIDES_KEY) ?? "{}"
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const overrides: TypoOverrides = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        overrides[key] = value as TypoOverrides[string];
      }
    }
    return overrides;
  } catch {
    return {};
  }
}

export function countTypoOverrides(overrides: TypoOverrides): number {
  let count = 0;
  for (const tokenOverride of Object.values(overrides)) {
    count += Object.keys(tokenOverride).length;
  }
  return count;
}

export function writeTypoOverrides(overrides: TypoOverrides): void {
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

export function injectTypoStyles(overrides: TypoOverrides): void {
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
      .map(
        ([prop, value]) =>
          `${TYPO_PROP_CSS[prop as TypoProp]}: ${value} !important`
      )
      .join("; ");
    if (declarations) {
      rules.push(`${token.selector} { ${declarations}; }`);
    }
  }

  styleEl.textContent = rules.join("\n");
}

export function readFontFamilyOverrides(): FontFamilyOverrides {
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(FONT_FAMILY_OVERRIDES_KEY) ?? "{}"
    );
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }
    const result: FontFamilyOverrides = {};
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.sans === "string") {
      result.sans = obj.sans;
    }
    if (typeof obj.mono === "string") {
      result.mono = obj.mono;
    }
    return result;
  } catch {
    return {};
  }
}

export function writeFontFamilyOverrides(overrides: FontFamilyOverrides): void {
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

export function injectFontFamilyStyles(overrides: FontFamilyOverrides): void {
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
    .map(
      (f) =>
        `family=${encodeURIComponent(f!)}:wght@100;200;300;400;500;600;700;800;900`
    )
    .join("&");
  const href = `https://fonts.googleapis.com/css2?${families}&display=swap`;

  if (!linkEl) {
    linkEl = document.createElement("link");
    linkEl.id = FONT_FAMILY_LINK_ID;
    linkEl.rel = "stylesheet";
    document.head.appendChild(linkEl);
  }
  linkEl.href = href;

  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = FONT_FAMILY_STYLE_ID;
    document.head.appendChild(styleEl);
  }

  const rules: string[] = [];
  if (overrides.sans) {
    rules.push(
      `body { font-family: "${overrides.sans}", sans-serif !important; }`
    );
    rules.push(
      `body :not(.s-font-mono):not(code):not(pre):not(kbd):not(samp):not([class*="heading-mono"]):not([class*="icon"]):not([class*="Icon"]) { font-family: inherit !important; }`
    );
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

export function readPosition(): { x: number; y: number } {
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

export function readDockMode(): "docked" | "floating" {
  return localStorage.getItem(DOCK_MODE_KEY) === "floating"
    ? "floating"
    : "docked";
}

export function readDockedPanelPosition(): {
  right: number;
  bottom: number;
} {
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
