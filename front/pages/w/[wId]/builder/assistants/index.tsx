import {
  PageHeader,
  PlusIcon,
  RobotStrokeIcon,
  SectionHeader,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { isDevelopmentOrDustWorkspace } from "@app/lib/development";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  gaTrackingId: string;
}> = async (context) => {
  const session = await getSession(context.req, context.res);

  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  if (
    !owner ||
    !user ||
    !auth.isBuilder() ||
    !isDevelopmentOrDustWorkspace(owner)
  ) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AssistantsBuilder({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();

  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "assistants" })}
    >
      <PageHeader
        title="Assistants Builder"
        icon={RobotStrokeIcon}
        description="Build an assistant."
      />
      <div>
        <SectionHeader
          title="Custom Assistants"
          description="Build your own Assistant, use specific instructions and specific data sources to get better answers."
          action={{
            label: "Create a new Assistant",
            variant: "secondary",
            icon: PlusIcon,
            size: "sm",
            onClick: () => {
              void router.push(`/w/${owner.sId}/builder/assistants/new`);
            },
          }}
        />
      </div>
    </AppLayout>
  );
}
