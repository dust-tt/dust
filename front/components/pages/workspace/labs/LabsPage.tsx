import { AgentSidebarMenu } from "@app/components/assistant/conversation/SidebarMenu";
import { FeatureAccessButton } from "@app/components/labs/FeatureAccessButton";
import {
  useSetContentWidth,
  useSetNavChildren,
  useSetPageTitle,
} from "@app/components/sparkle/AppLayoutContext";
import {
  useAuth,
  useFeatureFlags,
  useWorkspace,
} from "@app/lib/auth/AuthContext";
import type { LabsFeatureItemType } from "@app/types/labs";
import type { WhitelistableFeature } from "@app/types/shared/feature_flags";
import {
  ActionCodeBoxIcon,
  ContextItem,
  EyeIcon,
  Icon,
  Page,
  TestTubeIcon,
} from "@dust-tt/sparkle";
import { useMemo } from "react";

const LABS_FEATURES: LabsFeatureItemType[] = [
  {
    id: "transcripts",
    label: "Meeting Transcripts Processing",
    featureFlag: "labs_transcripts",
    visibleWithoutAccess: true,
    icon: EyeIcon,
    description:
      "Receive meeting minutes processed by email automatically and store them in a Dust Folder.",
  },
  {
    id: "mcp_actions",
    label: "MCP Actions Dashboard",
    featureFlag: "labs_mcp_actions_dashboard",
    visibleWithoutAccess: false,
    icon: ActionCodeBoxIcon,
    description:
      "Monitor and track MCP (Model Context Protocol) actions executed by your agents.",
    onlyAdminCanManage: true,
  },
];

const getVisibleFeatures = (featureFlags: WhitelistableFeature[]) => {
  return LABS_FEATURES.filter(
    (feature) =>
      feature.visibleWithoutAccess || featureFlags.includes(feature.featureFlag)
  );
};

export function LabsPage() {
  const owner = useWorkspace();
  const { isAdmin } = useAuth();
  const { featureFlags } = useFeatureFlags();

  const visibleFeatures = getVisibleFeatures(featureFlags);

  const navChildren = useMemo(
    () => <AgentSidebarMenu owner={owner} />,
    [owner]
  );

  useSetContentWidth("centered");
  useSetPageTitle("Dust - Exploratory features");
  useSetNavChildren(navChildren);

  return (
    <>
      <Page.Header
        title="Exploratory features"
        icon={TestTubeIcon}
        description="Expect some bumps and changes. Feedback welcome, tell us what you think!"
      />
      <Page.Layout direction="vertical">
        <ContextItem.List>
          <ContextItem.SectionHeader
            title="Features"
            description="All features presented here are in beta and may change or be removed."
          />

          {visibleFeatures.map((item) => (
            <ContextItem
              key={item.id}
              title={item.label}
              action={
                <FeatureAccessButton
                  accessible={featureFlags.includes(item.featureFlag)}
                  featureName={item.label}
                  managePath={`/w/${owner.sId}/labs/${item.id}`}
                  owner={owner}
                  canRequestAccess={isAdmin}
                  canManage={!item.onlyAdminCanManage || isAdmin}
                />
              }
              visual={<Icon visual={item.icon} />}
            >
              <ContextItem.Description description={item.description} />
            </ContextItem>
          ))}
        </ContextItem.List>
      </Page.Layout>
    </>
  );
}
