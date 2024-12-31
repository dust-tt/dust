import {
  ConfluenceLogo,
  DocumentTextIcon,
  DriveLogo,
  GithubLogo,
  ImageIcon,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { SVGProps } from "react";

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

export const citationIconMap: Record<
  CitationIconType,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  confluence: ConfluenceLogo,
  document: DocumentTextIcon,
  github: GithubLogo,
  google_drive: DriveLogo,
  intercom: IntercomLogo,
  microsoft: MicrosoftLogo,
  zendesk: ZendeskLogo,
  notion: NotionLogo,
  slack: SlackLogo,
  image: ImageIcon,
  snowflake: SnowflakeLogo,
};

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
