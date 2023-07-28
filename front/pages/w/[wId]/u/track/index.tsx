import {
  ArchiveBoxIcon,
  ArrowDownOnSquareIcon,
  DocumentPlusIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import React from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { UserType, WorkspaceType } from "@app/types/user";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  readOnly: boolean;
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
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppTrackDocuments({
  user,
  owner,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({ owner, current: "track" })}
    >
      <div className="flex h-full flex-col">
        <div className="container">
          {readOnly && (
            <div
              className="mb-10 rounded-md border-l-4 border-action-500 bg-action-100 p-4 text-action-700"
              role="alert"
            >
              <p className="font-bold">Read-only view</p>
              <p className="text-sm">
                Only users with the role Builder or Admin in the workspace can
                edit templates.
              </p>
            </div>
          )}

          <div className="mb-12 divide-y divide-gray-200">
            <div className="pb-6">
              <h3 className="text-base font-medium leading-6 text-gray-900">
                Track
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Track keeps your documents current, automatically identifying
                and suggesting updates when new data could impact their accuracy
                and relevancy.
              </p>
            </div>
            <div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">Step 1: Pick Your Document</p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <DocumentPlusIcon className="mr-1 inline-block h-5 w-5" />
                    Choose the document you want to monitor.
                  </li>
                </ul>
              </div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">Step 2: Turn On the Tracker</p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <ArrowDownOnSquareIcon className="mr-1 inline-block h-5 w-5" />
                    Add the DUST_TRACK() tag to your document and include your
                    Dust account email.
                    <br />
                    Like this: DUST_TRACK(your-dust-account-email@example.com).
                    <br />
                    <br />
                    This gets the tracker started on checking your document.
                  </li>
                </ul>
              </div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">Step 3: Get and Use Updates</p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <ArchiveBoxIcon className="mr-1 inline-block h-5 w-5" />
                    Doc Tracker will send an email to your Dust account when it
                    finds new data that could change your document.
                    <br />
                    <br />
                    Check out the suggestions, then update your document to keep
                    it current and accurate.
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mb-10 divide-y divide-gray-200">
            <div className="pb-6">
              <h3 className="text-base font-medium leading-6 text-gray-900">
                Tracked Documents
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                The documents you are tracking.
              </p>
            </div>
            <div>
              <div className="overflow-x-auto sm:-mx-6 lg:-mx-8">
                <div className="inline-block min-w-full py-2 sm:px-6 lg:px-8">
                  <div className="mt-4">
                    <table className="min-w-full text-left text-sm font-light">
                      <thead className="font-medium">
                        <tr>
                          <th scope="col" className="px-3 py-4">
                            Title
                          </th>
                          <th scope="col" className="px-12 py-4">
                            Data Source
                          </th>
                          <th scope="col" className="px-3 py-4">
                            Tracking Since
                          </th>
                        </tr>
                      </thead>
                      <tbody></tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
