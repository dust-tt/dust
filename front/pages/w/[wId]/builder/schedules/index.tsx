import { ClockIcon, Page, PlusIcon } from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { NewScheduleModal } from "@app/components/NewScheduleModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import apiConfig from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import type { ScheduledAgentResource } from "@app/lib/resources/scheduled_agent_resource";
import {
  useScheduledAgents,
} from "@app/lib/swr";
export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  user: UserType;
  subscription: SubscriptionType;
  gaTrackingId: string;
}>(async (_context, auth) => {
  const owner = auth.workspace();
  const subscription = auth.subscription();
  const user = auth.user();

  if (
    !owner ||
    !owner.flags.includes("labs_transcripts") ||
    !subscription ||
    !user
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      user,
      subscription,
      gaTrackingId: apiConfig.getGaTrackingId(),
    },
  };
});

export default function SchedulesIndex({
  owner,
  subscription,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isFairUseModalOpened, setIsFairUseModalOpened] = useState(false);

  const {
    scheduledAgents,
    isScheduledAgentsLoading,
    mutateScheduledAgents,
  } = useScheduledAgents({ workspaceId: owner.sId });

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      pageTitle="Dust - Schedule assistant actions"
      subNavigation={subNavigationBuild({
        owner,
        current: "schedule",
      })}
    >
      <NewScheduleModal
        isOpened={isFairUseModalOpened}
        onClose={async () => { 
          await mutateScheduledAgents();
          setIsFairUseModalOpened(false)
        }}
        owner={owner}
      />
      <Page>
        <Page.Header
          title="Schedule assistant actions"
          icon={ClockIcon}
          description="Let your assistants run regularly and send their results to a destination of your choice."
        />

        <Page.SectionHeader
          title="Workspace schedules"
          description="Schedules that have already been created in your workspace"
          action={{
            label: "Create schedule",
            size: "sm",
            icon: PlusIcon,
            onClick: () => setIsFairUseModalOpened(true),
          }}
        />
        {scheduledAgents && scheduledAgents.length > 0 && !isScheduledAgentsLoading && (
        <Page.Layout direction="vertical">
          {scheduledAgents.map((scheduledAgent) => (
            <div key={scheduledAgent.sId}>
              <div>{scheduledAgent.name}</div>
            </div>
          ))}
        </Page.Layout>
        )}
      </Page>
    </AppLayout>
  );
}
