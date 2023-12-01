import {
  ArrowUpOnSquareIcon,
  Button,
  Page,
  SectionHeader,
} from "@dust-tt/sparkle";
import { UserType, WorkspaceType } from "@dust-tt/types";
import { SubscriptionType } from "@dust-tt/types";
import { PlusIcon } from "@heroicons/react/24/outline";
import { GetServerSideProps, InferGetServerSidePropsType } from "next";
import Link from "next/link";
import { useRouter } from "next/router";

import AppLayout from "@app/components/sparkle/AppLayout";
import { subNavigationAdmin } from "@app/components/sparkle/navigation";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { useEventSchemas } from "@app/lib/swr";

const { GA_TRACKING_ID = "" } = process.env;
export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
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
  const subscription = auth.subscription();
  if (!owner || !subscription) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      user,
      owner,
      subscription,
      readOnly: !auth.isBuilder(),
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function AppExtractEvents({
  user,
  owner,
  subscription,
  readOnly,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { schemas, isSchemasLoading } = useEventSchemas(owner);
  const router = useRouter();
  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="settings"
      subNavigation={subNavigationAdmin({ owner, current: "extract" })}
    >
      <Page.Header
        title="Extract"
        icon={ArrowUpOnSquareIcon}
        description="Extract is your go-to tool for capturing structured data
        effortlessly within your notes. Use Extract markers to specify sections in your notes that you want to revisit or analyze. No more scrolling and searching!"
      />

      <div>
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
                    <Link
                      href={`/w/${owner.sId}/u/extract/templates/${schema.sId}/edit`}
                      className="block"
                    >
                      [[{schema.marker}]]
                    </Link>
                  </td>
                  <td className="w-full px-12 py-4">
                    {" "}
                    {/* Set the second column to take max width */}
                    <Link
                      href={`/w/${owner.sId}/u/extract/templates/${schema.sId}/edit`}
                      className="block"
                    >
                      {schema.description}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4">
                    <Button
                      label="See extracted data"
                      variant="tertiary"
                      onClick={() =>
                        router.push(
                          `/w/${owner.sId}/u/extract/templates/${schema.sId}`
                        )
                      }
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="my-10">
          <Link href={`/w/${owner.sId}/u/extract/templates/new`}>
            <Button label="Create New" icon={PlusIcon} disabled={readOnly} />
          </Link>
        </div>
      </div>
    </AppLayout>
  );
}
