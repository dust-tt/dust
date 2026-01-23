import { asDisplayName } from "@app/shared/lib/utils";
import {
  Button,
  CloudArrowLeftRightIcon,
  ConfluenceLogo,
  ContentMessage,
  DriveLogo,
  GithubLogo,
  GmailLogo,
  HubspotLogo,
  InformationCircleIcon,
  JiraLogo,
  LinearLogo,
  MicrosoftLogo,
  MicrosoftOutlookLogo,
  MicrosoftTeamsLogo,
  NotionLogo,
  SalesforceLogo,
  SlackLogo,
} from "@dust-tt/sparkle";
import type { ComponentType } from "react";

const PROVIDER_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  gmail: GmailLogo,
  "google drive": DriveLogo,
  drive: DriveLogo,
  slack: SlackLogo,
  notion: NotionLogo,
  github: GithubLogo,
  confluence: ConfluenceLogo,
  jira: JiraLogo,
  linear: LinearLogo,
  hubspot: HubspotLogo,
  salesforce: SalesforceLogo,
  microsoft: MicrosoftLogo,
  outlook: MicrosoftOutlookLogo,
  "microsoft outlook": MicrosoftOutlookLogo,
  teams: MicrosoftTeamsLogo,
  "microsoft teams": MicrosoftTeamsLogo,
};

function getProviderIcon(
  displayName: string
): ComponentType<{ className?: string }> {
  return PROVIDER_ICONS[displayName.toLowerCase()] ?? InformationCircleIcon;
}

interface MCPServerAuthRequiredProps {
  dustDomain: string;
  workspaceId: string;
  conversationId: string;
  mcpServerDisplayName: string;
}

export function MCPServerAuthRequired({
  dustDomain,
  workspaceId,
  conversationId,
  mcpServerDisplayName,
}: MCPServerAuthRequiredProps) {
  const formattedDisplayName = asDisplayName(mcpServerDisplayName);
  const IconComponent = getProviderIcon(mcpServerDisplayName);

  const onConnectClick = () => {
    const conversationUrl = `${dustDomain}/w/${workspaceId}/assistant/${conversationId}`;
    window.open(conversationUrl, "_blank");
  };

  return (
    <ContentMessage
      title={formattedDisplayName || "Personal authentication required"}
      variant="primary"
      className="flex w-80 min-w-[500px] flex-col gap-3"
      icon={IconComponent}
    >
      <div className="font-sm text-foreground dark:text-foreground-night whitespace-normal break-words">
        Your agent is trying to use{" "}
        <span className="font-semibold">
          {formattedDisplayName || "a tool"}
        </span>
        .
        <br />
        <span className="font-semibold">
          Connect your account from our website to continue.
        </span>
      </div>
      <div className="mt-3 flex flex-row justify-end">
        <Button
          label="Open conversation on Dust"
          variant="highlight"
          size="xs"
          icon={CloudArrowLeftRightIcon}
          onClick={onConnectClick}
        />
      </div>
    </ContentMessage>
  );
}
