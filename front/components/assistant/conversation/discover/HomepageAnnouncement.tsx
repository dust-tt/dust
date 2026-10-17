import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import { isCreditBasedPlan } from "@app/lib/plans/plan_codes";
import { AnnouncementPill, FigmaLogo } from "@dust-tt/sparkle";
import { useLingui } from "@lingui/react/macro";
import type { ComponentType, CSSProperties } from "react";

interface HomepageAnnouncementEntry {
  isVisible: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  /** Destination of the pill; it is static text without one. */
  href?: string;
  target?: string;
}

interface HomepageAnnouncementProps {
  style?: CSSProperties;
}

export function HomepageAnnouncement({ style }: HomepageAnnouncementProps) {
  const { t } = useLingui();
  const { hasFeature } = useFeatureFlags();
  const { subscription } = useAuth();

  // The first visible entry is shown; add new announcements at the top.
  const announcements: HomepageAnnouncementEntry[] = [
    {
      // Mirrors the Figma preset's plan gate and its override flag.
      isVisible:
        isCreditBasedPlan(subscription.plan) || hasFeature("figma_mcp"),
      icon: FigmaLogo,
      label: t`Figma MCP is now available`,
      href: "https://dust.tt/integrations/figma",
      target: "_blank",
    },
  ];

  const entry = announcements.find(({ isVisible }) => isVisible);
  if (!entry) {
    return null;
  }

  return (
    <div style={style}>
      <AnnouncementPill
        icon={entry.icon}
        label={entry.label}
        href={entry.href}
        target={entry.target}
      />
    </div>
  );
}
