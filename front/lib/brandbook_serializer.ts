import type { BrandPlaybookType } from "@app/types/brandbook";

export interface BrandDocument {
  documentId: string;
  title: string;
  text: string;
  tags: string[];
  source_url: null;
}

/**
 * Converts a BrandPlaybookType into an array of Dust documents.
 * Each document covers one logical section of the playbook.
 * Documents are ordered for sequential upload (BACK7 compliant — no Promise.all).
 *
 * Always produced:
 *   - _playbook  → full JSON source of truth (for agents that want structured data)
 *   - brand      → name, tagline, mission, positioning
 *   - identity   → colors + typography
 *
 * Conditionally produced (only when content is non-empty):
 *   - voice      → tone, key messages, do/don't
 */
export function serializeBrandPlaybook(
  playbook: BrandPlaybookType
): BrandDocument[] {
  const brandName = playbook.brand.name.trim() || "Brand";
  const docs: BrandDocument[] = [];

  // ── 1. JSON source of truth ──────────────────────────────
  docs.push({
    documentId: "_playbook",
    title: `${brandName} — Brand Playbook (JSON)`,
    text: `\`\`\`json\n${JSON.stringify(playbook, null, 2)}\n\`\`\``,
    tags: ["brandbook", "playbook", "json"],
    source_url: null,
  });

  // ── 2. Brand identity ────────────────────────────────────
  docs.push({
    documentId: "brand",
    title: `${brandName} — Brand Identity`,
    text: [
      `# ${brandName} — Brand Identity`,
      "",
      `**Name:** ${playbook.brand.name}`,
      playbook.brand.tagline ? `**Tagline:** ${playbook.brand.tagline}` : null,
      playbook.brand.mission ? `**Mission:** ${playbook.brand.mission}` : null,
      playbook.brand.positioning
        ? `**Positioning:** ${playbook.brand.positioning}`
        : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    tags: ["brandbook", "brand", "identity"],
    source_url: null,
  });

  // ── 3. Visual identity (colors + typography) ─────────────
  const { colors, typography, logoUrl } = playbook.identity;
  docs.push({
    documentId: "identity",
    title: `${brandName} — Visual Identity`,
    text: [
      `# ${brandName} — Visual Identity`,
      "",
      "## Color Palette",
      `- **Primary:** ${colors.primary}`,
      `- **Secondary:** ${colors.secondary}`,
      `- **Background:** ${colors.background}`,
      `- **Text:** ${colors.text}`,
      "",
      "## Typography",
      `- **Heading:** ${typography.heading.family} (weight: ${typography.heading.weight})`,
      `- **Body:** ${typography.body.family} (weight: ${typography.body.weight})`,
      `- **Accent:** ${typography.accent.family} (weight: ${typography.accent.weight})`,
      logoUrl ? `\n## Logo\n${logoUrl}` : null,
    ]
      .filter((line): line is string => line !== null)
      .join("\n"),
    tags: ["brandbook", "visual", "colors", "typography"],
    source_url: null,
  });

  // ── 4. Voice (conditional) ──────────────────────────────
  const { tone, keyMessages, doList, dontList } = playbook.voice;
  const hasVoiceContent =
    tone.trim() || keyMessages.trim() || doList.trim() || dontList.trim();

  if (hasVoiceContent) {
    docs.push({
      documentId: "voice",
      title: `${brandName} — Brand Voice`,
      text: [
        `# ${brandName} — Brand Voice`,
        "",
        tone ? `## Tone\n${tone}` : null,
        keyMessages ? `## Key Messages\n${keyMessages}` : null,
        doList
          ? `## Do\n${doList
              .split("\n")
              .filter(Boolean)
              .map((l) => `- ${l}`)
              .join("\n")}`
          : null,
        dontList
          ? `## Don't\n${dontList
              .split("\n")
              .filter(Boolean)
              .map((l) => `- ${l}`)
              .join("\n")}`
          : null,
      ]
        .filter((block): block is string => block !== null)
        .join("\n\n"),
      tags: ["brandbook", "voice", "tone"],
      source_url: null,
    });
  }

  return docs;
}
