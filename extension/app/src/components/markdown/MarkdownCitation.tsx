import {
  ConfluenceLogo,
  DocumentTextStrokeIcon,
  DriveLogo,
  GithubLogo,
  ImageStrokeIcon,
  IntercomLogo,
  MicrosoftLogo,
  NotionLogo,
  SlackLogo,
  SnowflakeLogo,
  ZendeskLogo,
} from "@dust-tt/sparkle";
import type { SVGProps } from "react";

export type CitationIconType =
  | "confluence"
  | "document"
  | "github"
  | "google_drive"
  | "intercom"
  | "microsoft"
  | "zendesk"
  | "notion"
  | "slack"
  | "image"
  | "snowflake";

export const citationIconMap: Record<
  CitationIconType,
  (props: SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  confluence: ConfluenceLogo,
  document: DocumentTextStrokeIcon,
  github: GithubLogo,
  google_drive: DriveLogo,
  intercom: IntercomLogo,
  microsoft: MicrosoftLogo,
  zendesk: ZendeskLogo,
  notion: NotionLogo,
  slack: SlackLogo,
  image: ImageStrokeIcon,
  snowflake: SnowflakeLogo,
};

export interface MarkdownCitation {
  description?: string;
  href?: string;
  title: string;
  icon: React.JSX.Element;
}
