import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/use/MainTab";
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

export default function AppAlerts({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout user={user} owner={owner} gaTrackingId={gaTrackingId}>
      <div className="flex flex-col">
        <div className="mt-2 flex flex-initial">
          <MainTab currentTab="Alerts" owner={owner} />
        </div>
        <div className="">
          <div className="mx-auto mt-8 max-w-2xl divide-y divide-gray-200 px-6">
            <div className="mt-16 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>🕒 Coming soon...</p>
              <p className="mt-8 italic">
                <span className="font-bold">Alerts</span> will stay on top of
                things in real time with updates crafted for you, on topics you
                choose, at the frequency you need.
              </p>
              <p className="mt-8">
                Reach out at{" "}
                <a href="mailto:team@dust.tt" className="font-bold">
                  team@dust.tt
                </a>{" "}
                with any ideas on what you'd like to see here.
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
