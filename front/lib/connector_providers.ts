import { DriveLogo, GithubLogo, NotionLogo, SlackLogo } from "@dust-tt/sparkle";

import { ConnectorProvider } from "@app/lib/connectors_api";

export const DISPLAY_NAME_BY_CONNECTOR_PROVIDER: Record<
  ConnectorProvider,
  string
> = {
  notion: "Notion",
  slack: "Slack",
  github: "GitHub",
  google_drive: "Google Drive",
};

export const LOGO_COMPONENT_BY_CONNECTOR_PROVIDER: Record<
  ConnectorProvider,
  (props: React.SVGProps<SVGSVGElement>) => React.JSX.Element
> = {
  notion: NotionLogo,
  slack: SlackLogo,
  github: GithubLogo,
  google_drive: DriveLogo,
};
