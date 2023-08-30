import {
  ArrowUpOnSquareIcon,
  PageHeader,
  SectionHeader,
} from "@dust-tt/sparkle";
import { PlusIcon } from "@heroicons/react/24/outline";
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
      subNavigation={subNavigationLab({ owner, current: "extract" })}
    >
      <PageHeader
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />

      <div>
        <SectionHeader
          title="How does it work?"
          description="Define unique markers like [[goals]] or [[incident]] in your notes. Add a description and properties, and Extract does the rest! For example, For example, writing [[incident:fire1]] on a Slack thread will trigger Extract to capture data like the summary, date, and people involved in the fire incident."
        />

        <SectionHeader
          title="Your worskpace's markers"
          description="Below are the markers defined for the workspace. You can edit them to add or remove properties, and manage the extracted data."
        />

        <table className="mt-6 min-w-full text-sm font-light">
          <tbody>
            {!isSchemasLoading &&
              schemas?.map((schema) => (
                <tr key={schema.marker} className="border-y">
                  <td className="whitespace-nowrap px-3 py-4 font-medium">
                    [[{schema.marker}]]
                  </td>
                  <td className="px-12 py-4">{schema.description}</td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <Button
                      type="submit"
                      onClick={() =>
                        router.push(
                          `/w/${owner.sId}/u/extract/templates/${schema.sId}/edit`
                        )
                      }
                    >
                      <div>
                        {readOnly
                          ? "See data to extract"
                          : "Edit data to extract"}
                      </div>
                    </Button>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <Button
                      type="submit"
                      onClick={() =>
                        router.push(
                          `/w/${owner.sId}/u/extract/templates/${schema.sId}`
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
          <Link href={`/w/${owner.sId}/u/extract/templates/new`}>
            <Button disabled={readOnly}>
              <PlusIcon className="-ml-1 mr-1 h-5 w-5" />
              Create New
            </Button>
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
