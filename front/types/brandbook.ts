export const BRAND_COLORS_KEYS = [
  "primary",
  "secondary",
  "background",
  "text",
] as const;

export type BrandColorKey = (typeof BRAND_COLORS_KEYS)[number];

export type BrandColors = Record<BrandColorKey, string>;

export const BRAND_TYPOGRAPHY_KEYS = ["heading", "body", "accent"] as const;

export type BrandTypographyKey = (typeof BRAND_TYPOGRAPHY_KEYS)[number];

export type BrandTypography = Record<
  BrandTypographyKey,
  { family: string; weight: string }
>;

export interface BrandPlaybookType {
  version: 1;
  brand: {
    name: string;
    tagline: string;
    mission: string;
    positioning: string;
  };
  identity: {
    colors: BrandColors;
    typography: BrandTypography;
    logoUrl: string | null;
  };
  voice: {
    tone: string;
    keyMessages: string;
    doList: string; // newline-separated
    dontList: string; // newline-separated
  };
}

export const DEFAULT_BRAND_PLAYBOOK: BrandPlaybookType = {
  version: 1,
  brand: {
    name: "",
    tagline: "",
    mission: "",
    positioning: "",
  },
  identity: {
    colors: {
      primary: "#1C91FF",
      secondary: "#418B5C",
      background: "#FFFFFF",
      text: "#111418",
    },
    typography: {
      heading: { family: "Georgia, serif", weight: "600" },
      body: { family: "Inter, sans-serif", weight: "400" },
      accent: { family: "monospace", weight: "400" },
    },
    logoUrl: null,
  },
  voice: {
    tone: "",
    keyMessages: "",
    doList: "",
    dontList: "",
  },
};
