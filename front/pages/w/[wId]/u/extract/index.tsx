import {
  ArrowDownOnSquareIcon,
  ArrowDownOnSquareStackIcon,
  ArrowUpTrayIcon,
  ClipboardDocumentCheckIcon,
  LightBulbIcon,
  PlusIcon,
  WrenchIcon,
} from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";
import React from "react";

import { Button } from "@app/components/Button";
import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationLab } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useEventSchemas } from "@app/lib/swr";
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

export default function AppExtractEvents({
  user,
  owner,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { schemas, isSchemasLoading } = useEventSchemas(owner);
  const router = useRouter();
  return (
    <AppLayout
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="lab"
      subNavigation={subNavigationLab({owner, current: "extract"})}
    >
      <div className="flex h-full flex-col">
        <div className="container">
          {readOnly && (
            <div
              className="mb-10 rounded-md border-l-4 border-violet-500 bg-violet-100 p-4 text-violet-700"
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
                Extract
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Extract associates a template with a [[marker]] to automate the
                extraction of structured data from your datasources.
              </p>
            </div>
            <div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">
                  Step1: Set some markers/templates
                </p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <LightBulbIcon className="mr-1 inline-block h-5 w-5" />
                    Define a new marker, such as <i>idea</i> or <i>tasks</i>.
                  </li>
                  <li>
                    <WrenchIcon className="mr-1 inline-block h-5 w-5" />
                    Define the properties to extract for this template:&nbsp;
                    for <i>idea</i> it could be a name and a description;&nbsp;
                    for <i>tasks</i> it could be an owner, a day, and a list of
                    tasks.
                  </li>
                </ul>
              </div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">Step 2: Extract data</p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <ArrowDownOnSquareIcon className="mr-1 inline-block h-5 w-5" />
                    On any of your datasources, write [[idea]] or [[tasks]]
                    whenever you want to extract this data.
                  </li>
                  <li>
                    <ArrowDownOnSquareStackIcon className="mr-1 inline-block h-5 w-5" />
                    If there are multiple ideas on the same document, you can
                    just append a unique identifier on the marker, such as
                    [[idea:2]].
                  </li>
                </ul>
              </div>
              <div className="mt-6">
                <p className="mb-4 text-sm ">
                  Step 3: Manage your extracted data
                </p>
                <ul className="list-inside text-sm font-light">
                  <li>
                    <ClipboardDocumentCheckIcon className="mr-1 inline-block h-5 w-5" />
                    Read and validate or fix the extracted data.
                  </li>
                  <li>
                    <ArrowUpTrayIcon className="mr-1 inline-block h-5 w-5" />
                    Export the validated data as you wish.
                  </li>
                </ul>
              </div>
            </div>
          </div>
          <div className="mb-10 divide-y divide-gray-200">
            <div className="pb-6">
              <h3 className="text-base font-medium leading-6 text-gray-900">
                Markers & templates
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Manage your markers & templates and access extracted data.
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
                            Marker
                          </th>
                          <th scope="col" className="px-12 py-4">
                            Description
                          </th>
                          <th scope="col" className="px-3 py-4">
                            Template
                          </th>
                          <th scope="col" className="px-3 py-4">
                            Extracted data
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {!isSchemasLoading &&
                          schemas?.map((schema) => (
                            <tr key={schema.marker} className="border-y">
                              <td className="whitespace-nowrap px-3 py-4 font-medium">
                                [[{schema.marker}]]
                              </td>
                              <td className="whitespace-nowrap px-12 py-4">
                                {schema.description}
                              </td>
                              <td className="whitespace-nowrap px-3 py-4">
                                <Button
                                  type="submit"
                                  onClick={() =>
                                    router.push(
                                      `/w/${owner.sId}/u/extract/${schema.marker}/edit`
                                    )
                                  }
                                >
                                  <div>
                                    {readOnly
                                      ? "View template"
                                      : "Manage template"}
                                  </div>
                                </Button>
                              </td>
                              <td className="whitespace-nowrap px-3 py-4">
                                <Button
                                  type="submit"
                                  onClick={() =>
                                    router.push(
                                      `/w/${owner.sId}/u/extract/${schema.marker}`
                                    )
                                  }
                                >
                                  <div>See extracted data</div>
                                </Button>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>

                    <div className="my-10">
                      <Link href={`/w/${owner.sId}/u/extract/new`}>
                        <Button disabled={readOnly}>
                          <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
                          Create New
                        </Button>
                      </Link>
                    </div>
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
