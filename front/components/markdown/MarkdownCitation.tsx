const CITATION_ICONS = [
  "confluence",
  "document",
  "github",
  "google_drive",
  "intercom",
  "microsoft",
  "zendesk",
  "notion",
  "slack",
  "image",
  "snowflake",
] as const;

export type CitationIconType = (typeof CITATION_ICONS)[number];

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  type: CitationIconType;
}
