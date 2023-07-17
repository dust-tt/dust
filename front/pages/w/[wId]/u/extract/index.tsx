import { GetServerSideProps, InferGetServerSidePropsType } from "next";

import AppLayout from "@app/components/AppLayout";
import MainTab from "@app/components/use/MainTab";
import {
  Authenticator,
  getSession,
  getUserFromSession,
} from "@app/lib/auth";
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
  if (!owner) {
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

export default function AppExtractEvents({
  user,
  owner,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      app={undefined}
      dataSource={undefined}
    >
      <div className="flex h-full flex-col">
        <div className="mt-2">
          <MainTab currentTab="Extract data" owner={owner} />
        </div>

        <div className="">
          <div className="mx-auto mt-8 max-w-2xl divide-y divide-gray-200 px-6">
            <div className="mt-16 flex flex-col items-center justify-center text-sm text-gray-500">
              <p>📤 Welcome to Extract Events!</p>
              <p className="mt-8">
                [This page is under construction, please come back later! 😬]
              </p>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
