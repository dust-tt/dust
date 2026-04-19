import { BRAND_TYPOGRAPHY_KEYS } from "@app/types/brandbook";
import type { BrandTypography, BrandTypographyKey } from "@app/types/brandbook";
import { Input } from "@dust-tt/sparkle";
import React, { useCallback } from "react";

const ROLE_LABELS: Record<BrandTypographyKey, string> = {
  heading: "Heading",
  body: "Body",
  accent: "Accent",
};

const ROLE_PREVIEW_TEXT: Record<BrandTypographyKey, string> = {
  heading: "The quick brown fox",
  body: "Pack my box with five dozen liquor jugs.",
  accent: "MONO 0123456789",
};

const ROLE_PREVIEW_SIZE: Record<BrandTypographyKey, string> = {
  heading: "1.25rem",
  body: "0.9375rem",
  accent: "0.8125rem",
};

interface BrandTypographyEditorProps {
  typography: BrandTypography;
  onChange: (typography: BrandTypography) => void;
}

/**
 * Renders one input row per typography role (heading / body / accent).
 * Each row has a family field, a weight field, and a live preview of the
 * font rendered at an appropriate size.
 */
export function BrandTypographyEditor({
  typography,
  onChange,
}: BrandTypographyEditorProps) {
  const handleFieldChange = useCallback(
    (
      role: BrandTypographyKey,
      field: "family" | "weight",
      value: string
    ) => {
      onChange({
        ...typography,
        [role]: { ...typography[role], [field]: value },
      });
    },
    [typography, onChange]
  );

  return (
    <div className="s-flex s-flex-col s-gap-5">
      {BRAND_TYPOGRAPHY_KEYS.map((role) => {
        const { family, weight } = typography[role];
        return (
          <div key={role} className="s-flex s-flex-col s-gap-2">
            <p className="s-text-sm s-font-medium s-text-foreground">
              {ROLE_LABELS[role]}
            </p>

            <div className="s-flex s-gap-2">
              <div className="s-flex-1">
                <Input
                  label="Font family"
                  value={family}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(role, "family", e.target.value)
                  }
                  placeholder="e.g. Inter, sans-serif"
                />
              </div>
              <div className="s-w-24 s-shrink-0">
                <Input
                  label="Weight"
                  value={weight}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    handleFieldChange(role, "weight", e.target.value)
                  }
                  placeholder="400"
                />
              </div>
            </div>

            {/* Live preview */}
            {family.trim() && (
              <p
                className="s-rounded-md s-border s-border-border s-bg-muted s-px-3 s-py-2 s-text-foreground"
                style={{
                  fontFamily: family,
                  fontWeight: weight || undefined,
                  fontSize: ROLE_PREVIEW_SIZE[role],
                  lineHeight: 1.4,
                }}
              >
                {ROLE_PREVIEW_TEXT[role]}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
