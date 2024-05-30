import {
  ClockIcon,
  ContextItem,
  Icon,
  Page,
  PlusIcon,
  RobotIcon,
} from "@dust-tt/sparkle";
import type { UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";
import { useState } from "react";

import { EditScheduleModal } from "@app/components/EditScheduleModal";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import apiConfig from "@app/lib/api/config";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { useScheduledAgents } from "@app/lib/swr";
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

  const { scheduledAgents, isScheduledAgentsLoading, mutateScheduledAgents } =
    useScheduledAgents({ workspaceId: owner.sId });

  return (
    <AppLayout
      subscription={subscription}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      pageTitle="Dust - Scheduled assistant"
      subNavigation={subNavigationBuild({
        owner,
        current: "schedule",
      })}
    >
      <EditScheduleModal
        isOpened={isFairUseModalOpened}
        onClose={async () => {
          await mutateScheduledAgents();
          setIsFairUseModalOpened(false);
        }}
        owner={owner}
      />
      <Page>
        <Page.Header
          title="Schedule assistants actions"
          icon={ClockIcon}
          description="Let your assistants run regularly and send their results to a destination of your choice."
        />

        <Page.SectionHeader
          title="Workspace Scheduled Assistants"
          description="Currently scheduled assistants in your workspace."
          action={{
            label: "Create schedule",
            size: "sm",
            icon: PlusIcon,
            onClick: () => setIsFairUseModalOpened(true),
          }}
        />
        {scheduledAgents &&
          scheduledAgents.length > 0 &&
          !isScheduledAgentsLoading && (
            <Page.Layout direction="vertical">
              {scheduledAgents.map((scheduledAgent) => (
                <ContextItem
                  key={scheduledAgent.sId}
                  title={scheduledAgent.name}
                  subElement={scheduledAgent.scheduleType}
                  visual={<Icon visual={RobotIcon} size="lg" />}
                  onClick={() => console.log(scheduledAgent.sId)}
                >
                  <ContextItem.Description>
                    <div className="line-clamp-2 text-element-700">
                      {scheduledAgent.prompt?.substring(0, 150)}
                    </div>
                  </ContextItem.Description>
                </ContextItem>
              ))}
            </Page.Layout>
          )}
      </Page>
    </AppLayout>
  );
}
