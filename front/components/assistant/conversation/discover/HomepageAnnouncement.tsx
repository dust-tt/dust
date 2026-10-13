import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useSystemSpace } from "@app/lib/swr/spaces";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import { isAdmin } from "@app/types/user";
import { AnnouncementPill } from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, CSSProperties } from "react";

interface HomepageAnnouncementEntry {
  featureFlag: WhitelistableFeature;
  icon: ComponentType<{ className?: string }>;
  label: MessageDescriptor;
  /** Admin-only link for the pill; `systemSpace` is where workspace tools are managed. */
  getAdminHref?: (ctx: {
    owner: WorkspaceType;
    systemSpace: SpaceType;
  }) => string;
}

// The first entry whose flag the workspace has is shown; add new announcements at the top.
const HOMEPAGE_ANNOUNCEMENTS: HomepageAnnouncementEntry[] = [];

interface HomepageAnnouncementProps {
  owner: WorkspaceType;
  style?: CSSProperties;
}

export function HomepageAnnouncement({
  owner,
  style,
}: HomepageAnnouncementProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();

  const entry = HOMEPAGE_ANNOUNCEMENTS.find(({ featureFlag }) =>
    hasFeature(featureFlag)
  );
  const { systemSpace } = useSystemSpace({
    workspaceId: owner.sId,
    disabled: !entry?.getAdminHref || !isAdmin(owner),
  });
  if (!entry) {
    return null;
  }

  const href =
    entry.getAdminHref && isAdmin(owner) && systemSpace
      ? entry.getAdminHref({ owner, systemSpace })
      : undefined;

  return (
    <div style={style}>
      <AnnouncementPill icon={entry.icon} label={t(entry.label)} href={href} />
    </div>
  );
}
