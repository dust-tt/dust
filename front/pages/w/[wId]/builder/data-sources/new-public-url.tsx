import { Checkbox, Page } from "@dust-tt/sparkle";
import type { DataSourceType, UserType, WorkspaceType } from "@dust-tt/types";
import type { SubscriptionType } from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import type { GetServerSideProps, InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationAssistants } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { classNames } from "@app/lib/utils";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps: GetServerSideProps<{
  user: UserType | null;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
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

  if (!auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSources = await getDataSources(auth);

  return {
    props: {
      user,
      owner,
      subscription,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
};

export default function DataSourceNew({
  user,
  owner,
  subscription,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [isValid, setIsValid] = useState(true);

  const [dataSourceNameError, setDataSourceNameError] = useState("");
  const [assistantDefaultSelected, setAssistantDefaultSelected] =
    useState(true);

  const [dataSourceUrl, setDataSourceUrl] = useState("");

  const formValidation = useCallback(() => {
    const urlRegex =
      /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;

    let edited = false;
    let valid = true;

    let exists = false;
    dataSources.forEach((d) => {
      if (d.name == dataSourceUrl) {
        exists = true;
      }
    });
    if (exists) {
      setDataSourceNameError("A Folder with the same name already exists");
      valid = false;
    } else if (dataSourceUrl.length == 0) {
      valid = false;
      setDataSourceNameError("");
    } else if (dataSourceUrl.startsWith("managed-")) {
      setDataSourceNameError(
        "DataSource name cannot start with the prefix `managed-`"
      );
      valid = false;
    } else if (!dataSourceUrl.match(urlRegex)) {
      setDataSourceNameError(
        "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c))"
      );
      valid = false;
    } else {
      edited = true;
      setDataSourceNameError("");
    }

    if (assistantDefaultSelected === false) {
      edited = true;
    }

    setIsEdited(edited);
    setIsValid(valid);
  }, [dataSources, assistantDefaultSelected, dataSourceUrl]);

  useEffect(() => {
    formValidation();
  }, [formValidation]);

  const router = useRouter();

  const handleCreate = async () => {
    setIsSaving(true);
    const res = await fetch(`/api/w/${owner.sId}/data_sources/managed`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        visibility: "private",
        assistantDefaultSelected,
        url: dataSourceUrl,
        type: "url",
        provider: "webcrawler",
      }),
    });
    if (res.ok) {
      await router.push(`/w/${owner.sId}/builder/data-sources/public-urls`);
    } else {
      const err = (await res.json()) as { error: APIError };
      setIsSaving(false);
      window.alert(`Error creating DataSource: ${err.error.message}`);
    }
  };

  return (
    <AppLayout
      subscription={subscription}
      user={user}
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationAssistants({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title="Create a Folder"
          onSave={isValid && isEdited && !isSaving ? handleCreate : undefined}
          onCancel={() => {
            void router.push(
              `/w/${owner.sId}/builder/data-sources/public-urls`
            );
          }}
        />
      }
      hideSidebar={true}
    >
      <div className="flex flex-1 flex-col space-y-4">
        <Page.SectionHeader
          title="Add a new public URL"
          description="Provide the public URL to be added."
        />
        <div>
          <div className="mt-6 grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <label
                htmlFor="dataSourceName"
                className="block text-sm font-medium text-gray-700"
              >
                Public URL
              </label>
              <div className="mt-1 flex rounded-md shadow-sm">
                <input
                  type="text"
                  name="url"
                  id="dataSourceUrl"
                  className={classNames(
                    "block w-full min-w-0 flex-1 rounded-md  text-sm",
                    dataSourceNameError
                      ? "border-gray-300 border-red-500 focus:border-red-500 focus:ring-red-500"
                      : "border-gray-300 focus:border-action-500 focus:ring-action-500"
                  )}
                  value={dataSourceUrl}
                  onChange={(e) => setDataSourceUrl(e.target.value)}
                />
              </div>
              <p className="mt-2 text-sm text-gray-500">
                This is the highest level URL on the selected domain that will
                be crawled.
              </p>
            </div>
            <div className="mt-2 sm:col-span-6">
              <div className="flex justify-between">
                <label
                  htmlFor="assistantDefaultSelected"
                  className="block text-sm font-medium text-gray-700"
                >
                  Availability to the @dust assistant
                </label>
              </div>
              <div className="mt-2 flex items-center">
                <Checkbox
                  checked={assistantDefaultSelected}
                  onChange={(checked) => setAssistantDefaultSelected(checked)}
                />
                <p className="ml-3 block text-sm text-sm font-normal text-gray-500">
                  Make this public URL available to the{" "}
                  <span className="font-semibold">@dust</span> assistant.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
