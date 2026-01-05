/**
 * List of internally allowed icon names for MCP server actions.
 *
 * IMPORTANT: This file MUST NOT import from @dust-tt/sparkle or any React components.
 * It's used by backend code that needs to validate icon names without browser dependencies.
 *
 * When adding new icons, add the icon name here AND update the InternalActionIcons
 * mapping in components/resources/resources_icons.tsx.
 */

export const INTERNAL_ALLOWED_ICONS = [
  // Action icons
  "ActionAtomIcon",
  "ActionBrainIcon",
  "ActionCloudArrowLeftRightIcon",
  "ActionDocumentTextIcon",
  "ActionEmotionLaughIcon",
  "ActionFrameIcon",
  "ActionGitBranchIcon",
  "ActionGlobeAltIcon",
  "ActionImageIcon",
  "ActionLightbulbIcon",
  "ActionLockIcon",
  "ActionMagnifyingGlassIcon",
  "ActionMegaphoneIcon",
  "ActionNoiseIcon",
  "ActionPieChartIcon",
  "ActionRobotIcon",
  "ActionScanIcon",
  "ActionSlideshowIcon",
  "ActionSpeakIcon",
  "ActionTableIcon",
  "ActionTimeIcon",
  // Tool icons
  "ToolsIcon",
  "CommandLineIcon",
  // Logo icons
  "AsanaLogo",
  "AshbyLogo",
  "CanvaLogo",
  "ConfluenceLogo",
  "DriveLogo",
  "FathomLogo",
  "FreshserviceLogo",
  "FrontLogo",
  "GcalLogo",
  "GithubLogo",
  "GitlabLogo",
  "GmailLogo",
  "GoogleSpreadsheetLogo",
  "GuruLogo",
  "HubspotLogo",
  "JiraLogo",
  "LinearLogo",
  "MicrosoftExcelLogo",
  "MicrosoftLogo",
  "MicrosoftOutlookLogo",
  "MicrosoftTeamsLogo",
  "MondayLogo",
  "NotionLogo",
  "OpenaiLogo",
  "SalesforceLogo",
  "SlackLogo",
  "StripeLogo",
  "SupabaseLogo",
  "ValTownLogo",
  "VantaLogo",
  "ZendeskLogo",
] as const;

export type InternalAllowedIconType =
  (typeof INTERNAL_ALLOWED_ICONS)[number];

/**
 * Type guard to check if a string is a valid internal allowed icon.
 * Can be used by backend code without importing Sparkle.
 */
export function isInternalAllowedIcon(
  icon: string
): icon is InternalAllowedIconType {
  return INTERNAL_ALLOWED_ICONS.includes(icon as InternalAllowedIconType);
}
