import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import { AnnouncementPill, FigmaLogo } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, CSSProperties } from "react";

interface HomepageAnnouncementEntry {
  /** Restricts the entry to workspaces with the flag; without it, everyone qualifies. */
  featureFlag?: WhitelistableFeature;
  icon: ComponentType<{ className?: string }>;
  label: MessageDescriptor;
  /** Destination of the pill; it is static text without one. */
  href?: string;
  target?: string;
}

// The first entry the workspace qualifies for is shown; add new announcements at the top.
const HOMEPAGE_ANNOUNCEMENTS: HomepageAnnouncementEntry[] = [
  {
    icon: FigmaLogo,
    label: msg`Figma MCP is now available`,
    href: "https://dust.tt/integrations/figma",
    target: "_blank",
  },
];

interface HomepageAnnouncementProps {
  style?: CSSProperties;
}

export function HomepageAnnouncement({ style }: HomepageAnnouncementProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();

  const entry = HOMEPAGE_ANNOUNCEMENTS.find(
    ({ featureFlag }) => !featureFlag || hasFeature(featureFlag)
  );
  if (!entry) {
    return null;
  }

  return (
    <div style={style}>
      <AnnouncementPill
        icon={entry.icon}
        label={t(entry.label)}
        href={entry.href}
        target={entry.target}
      />
    </div>
  );
}
