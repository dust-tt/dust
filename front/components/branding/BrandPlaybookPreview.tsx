import { BRAND_COLORS_KEYS, BRAND_TYPOGRAPHY_KEYS } from "@app/types/brandbook";
import type { BrandPlaybookType } from "@app/types/brandbook";
import React from "react";

interface BrandPlaybookPreviewProps {
  playbook: BrandPlaybookType;
}

/**
 * A live, in-modal design-system preview rendered entirely from the playbook
 * data — no network call, no external dependencies. Useful to let the user
 * see how their brand tokens look before saving.
 *
 * Sections:
 *   1. Brand header  — name, tagline, mission
 *   2. Color palette — swatches for all 4 tokens
 *   3. Typography    — specimen for heading / body / accent
 */
export function BrandPlaybookPreview({ playbook }: BrandPlaybookPreviewProps) {
  const { brand, identity } = playbook;
  const { colors, typography } = identity;

  const brandName = brand.name.trim() || "Your Brand";

  return (
    <div
      className="s-flex s-flex-col s-gap-6 s-rounded-xl s-border s-border-border s-p-5"
      style={{ backgroundColor: colors.background, color: colors.text }}
    >
      {/* ── 1. Brand header ── */}
      <div>
        {brand.name.trim() && (
          <h2
            style={{
              fontFamily: typography.heading.family,
              fontWeight: typography.heading.weight || undefined,
              color: colors.text,
              fontSize: "1.5rem",
              lineHeight: 1.2,
              marginBottom: "0.25rem",
            }}
          >
            {brandName}
          </h2>
        )}
        {brand.tagline.trim() && (
          <p
            style={{
              fontFamily: typography.body.family,
              fontWeight: typography.body.weight || undefined,
              color: colors.primary,
              fontSize: "1rem",
              lineHeight: 1.4,
              marginBottom: "0.5rem",
            }}
          >
            {brand.tagline}
          </p>
        )}
        {brand.mission.trim() && (
          <p
            style={{
              fontFamily: typography.body.family,
              fontWeight: typography.body.weight || undefined,
              color: colors.text,
              fontSize: "0.875rem",
              lineHeight: 1.5,
              opacity: 0.7,
            }}
          >
            {brand.mission}
          </p>
        )}
      </div>

      <hr style={{ borderColor: colors.secondary, opacity: 0.3 }} />

      {/* ── 2. Color palette ── */}
      <div>
        <p
          className="s-mb-2 s-text-xs s-font-semibold s-uppercase s-tracking-widest"
          style={{
            fontFamily: typography.accent.family,
            color: colors.text,
            opacity: 0.5,
          }}
        >
          Color Palette
        </p>
        <div className="s-flex s-gap-2">
          {BRAND_COLORS_KEYS.map((key) => (
            <div key={key} className="s-flex s-flex-col s-items-center s-gap-1">
              <span
                className="s-block s-h-10 s-w-10 s-rounded-md s-border s-border-black/10"
                style={{ backgroundColor: colors[key] }}
              />
              <span
                className="s-text-center"
                style={{
                  fontFamily: typography.accent.family,
                  fontSize: "0.625rem",
                  color: colors.text,
                  opacity: 0.6,
                }}
              >
                {key}
              </span>
            </div>
          ))}
        </div>
      </div>

      <hr style={{ borderColor: colors.secondary, opacity: 0.3 }} />

      {/* ── 3. Typography specimen ── */}
      <div>
        <p
          className="s-mb-2 s-text-xs s-font-semibold s-uppercase s-tracking-widest"
          style={{
            fontFamily: typography.accent.family,
            color: colors.text,
            opacity: 0.5,
          }}
        >
          Typography
        </p>
        <div className="s-flex s-flex-col s-gap-2">
          {BRAND_TYPOGRAPHY_KEYS.map((role) => {
            const { family, weight } = typography[role];
            const sizes = { heading: "1.25rem", body: "0.9375rem", accent: "0.8125rem" } as const;
            const samples = {
              heading: "The quick brown fox jumps",
              body: "Pack my box with five dozen liquor jugs.",
              accent: "MONO 0123456789 ABC",
            } as const;
            return (
              <p
                key={role}
                style={{
                  fontFamily: family || undefined,
                  fontWeight: weight || undefined,
                  color: colors.text,
                  fontSize: sizes[role],
                  lineHeight: 1.4,
                }}
              >
                {samples[role]}
              </p>
            );
          })}
        </div>
      </div>

      {/* ── 4. CTA button sample ── */}
      <div>
        <button
          type="button"
          className="s-cursor-default s-rounded-lg s-px-4 s-py-2 s-text-sm s-font-medium"
          style={{
            backgroundColor: colors.primary,
            color: colors.background,
            fontFamily: typography.body.family,
          }}
          tabIndex={-1}
          aria-hidden="true"
        >
          {`Get started with ${brandName}`}
        </button>
      </div>
    </div>
  );
}
