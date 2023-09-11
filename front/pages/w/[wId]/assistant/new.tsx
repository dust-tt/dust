import {
  Button,
  ChatBubbleBottomCenterTextIcon,
  CloudArrowDownIcon,
  Logo,
  PageHeader,
  RobotIcon,
} from "@dust-tt/sparkle";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
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
  if (!owner || !auth.isUser()) {
    return {
      redirect: {
        destination: "/",
        permanent: false,
      },
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

export function AssistantHelper({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-16 rounded-xl border border-structure-200 bg-structure-50 px-8 pb-8 pt-4 drop-shadow-2xl">
      {children}
    </div>
  );
}

export default function AssistantNew({
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
      topNavigationCurrent="assistant"
    >
      <PageHeader
        title="Welcome to Assistant"
        icon={ChatBubbleBottomCenterTextIcon}
      />
      <AssistantHelper>
        <div className="mb-8 text-lg font-bold">
          Get started with{" "}
          <Logo className="inline-block w-14 pb-0.5 pl-1"></Logo>
        </div>
        <p className="my-4 text-sm text-element-800">
          Lorem ispum dolor sit amet, consectetur adipiscing elit. You have
          access to multiple assistants, each with their own set of skills.
          Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </p>
        <p className="my-4 text-sm text-element-800">
          Assistants you have access to:{" "}
          <span className="font-bold italic">@gpt3.5-turbo</span>, and{" "}
          <span className="font-bold italic">@claude-instant</span>.
        </p>
        {["admin", "builder"].includes(owner.role) && (
          <div className="pt-4 text-center">
            <Button
              variant={"primary"}
              icon={RobotIcon}
              label="Configure new Custom Assistants"
              onClick={() => {
                void router.push(`/w/${owner.sId}/builder/assistants`);
              }}
            />
          </div>
        )}
      </AssistantHelper>
    </AppLayout>
  );
}
