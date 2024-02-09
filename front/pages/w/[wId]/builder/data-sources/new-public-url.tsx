import {
  Button,
  ContentMessage,
  DropdownMenu,
  Input,
  Page,
  RadioButton,
} from "@dust-tt/sparkle";
import type {
  DataSourceType,
  SubscriptionType,
  WorkspaceType,
} from "@dust-tt/types";
import type { APIError } from "@dust-tt/types";
import { WEBCRAWLER_MAX_DEPTH, WEBCRAWLER_MAX_PAGES } from "@dust-tt/types";
import type * as t from "io-ts";
import type { InferGetServerSidePropsType } from "next";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";

import AppLayout from "@app/components/sparkle/AppLayout";
import { AppLayoutSimpleSaveCancelTitle } from "@app/components/sparkle/AppLayoutTitle";
import { subNavigationBuild } from "@app/components/sparkle/navigation";
import { getDataSources } from "@app/lib/api/data_sources";
import { Authenticator, getSession } from "@app/lib/auth";
import { withGetServerSidePropsLogging } from "@app/logger/withlogging";
import type { PostManagedDataSourceRequestBodySchema } from "@app/pages/api/w/[wId]/data_sources/managed";

const { GA_TRACKING_ID = "" } = process.env;

export const getServerSideProps = withGetServerSidePropsLogging<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  dataSources: DataSourceType[];
  gaTrackingId: string;
}>(async (context) => {
  const session = await getSession(context.req, context.res);
  const auth = await Authenticator.fromSession(
    session,
    context.params?.wId as string
  );

  const owner = auth.workspace();
  const subscription = auth.subscription();

  if (!owner || !subscription || !auth.isBuilder()) {
    return {
      notFound: true,
    };
  }

  const dataSources = await getDataSources(auth);

  return {
    props: {
      owner,
      subscription,
      dataSources,
      gaTrackingId: GA_TRACKING_ID,
    },
  };
});

export default function DataSourceNew({
  owner,
  subscription,
  dataSources,
  gaTrackingId,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [isSaving, setIsSaving] = useState(false);
  const [isEdited, setIsEdited] = useState(false);
  const [isValid, setIsValid] = useState(true);

  const [dataSourceNameError, setDataSourceNameError] = useState("");
  const [dataSourceUrl, setDataSourceUrl] = useState("");
  const [maxPages, setMaxPages] = useState<number | null>(50);
  const [maxDepth, setMaxDepth] = useState<number | null>(2);
  const [crawlMode, setCrawlMode] = useState<"child" | "website">("website");

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

    setIsEdited(edited);
    setIsValid(valid);
  }, [dataSources, dataSourceUrl]);

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
        urlConfig: {
          url: dataSourceUrl,
          maxPages: maxPages || WEBCRAWLER_MAX_PAGES,
          depth: maxDepth || WEBCRAWLER_MAX_DEPTH,
          crawlMode: crawlMode,
        },
        type: "url",
        provider: "webcrawler",
        connectionId: undefined,
      } satisfies t.TypeOf<typeof PostManagedDataSourceRequestBodySchema>),
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
      owner={owner}
      gaTrackingId={gaTrackingId}
      topNavigationCurrent="assistants"
      subNavigation={subNavigationBuild({
        owner,
        current: "data_sources_static",
      })}
      titleChildren={
        <AppLayoutSimpleSaveCancelTitle
          title="Add a Website"
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
      <div className="py-8">
        <Page.Layout direction="vertical" gap="xl">
          <Page.Layout direction="vertical" gap="md">
            <Page.H variant="h3">Website Entry Point</Page.H>
            <Page.P>
              Enter the address of the website you'd like to explore.
            </Page.P>
            <Input
              placeholder="https://example.com/acticles"
              value={dataSourceUrl}
              onChange={(value) => setDataSourceUrl(value)}
              error={dataSourceNameError}
              name="dataSourceUrl"
              showErrorLabel
              className="text-sm"
            />
            <ContentMessage title="Ensure the webpage is public" variant="pink">
              Only directly accessible (without authetification), public
              websites will work here.
            </ContentMessage>
          </Page.Layout>

          <Page.Layout direction="vertical" gap="md">
            <Page.H variant="h3">Importation settings</Page.H>
            <Page.P>
              Adjust the settings in order to import only the data you are
              interested in.
            </Page.P>
          </Page.Layout>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8">
            <Page.Layout direction="vertical" sizing="grow">
              <Page.SectionHeader
                title="Crawling strategy"
                description="Do you want to stay on the domain or expend outside?"
              />
              <RadioButton
                value={crawlMode}
                className="flex-col font-medium"
                onChange={(value) => {
                  setCrawlMode(value == "child" ? "child" : "website");
                }}
                name="crawlMode"
                choices={[
                  {
                    label: "Only children pages",
                    value: "child",
                    disabled: false,
                  },
                  {
                    label: "Follow all the links",
                    value: "website",
                    disabled: false,
                  },
                ]}
              />
            </Page.Layout>
            <Page.Layout direction="vertical" sizing="grow">
              <Page.SectionHeader
                title="Refresh schedule"
                description="How often would you like to check for updates?"
              />
              <div>
                <DropdownMenu>
                  <DropdownMenu.Button>
                    <Button
                      variant="tertiary"
                      size="sm"
                      label="Never"
                      type="select"
                    />
                  </DropdownMenu.Button>
                  <DropdownMenu.Items width={220} origin="topLeft">
                    <DropdownMenu.Item label="Never" />
                    <DropdownMenu.Item label="Monthly" />
                    <DropdownMenu.Item label="Weekly" />
                    <DropdownMenu.Item label="Daily" />
                  </DropdownMenu.Items>
                </DropdownMenu>
              </div>
            </Page.Layout>
            <Page.Layout direction="vertical" sizing="grow">
              <Page.SectionHeader
                title="Depth of Search"
                description="How far from the starting page should we go?"
              />
              <Input
                placeholder={WEBCRAWLER_MAX_DEPTH.toString()}
                value={maxDepth?.toString() || ""}
                onChange={(value) => {
                  const parsed = parseInt(value);
                  if (!isNaN(parsed)) {
                    setMaxDepth(parsed);
                  } else if (value == "") {
                    setMaxDepth(null);
                  }
                }}
                showErrorLabel={
                  maxDepth &&
                  maxDepth > WEBCRAWLER_MAX_DEPTH &&
                  maxDepth &&
                  maxDepth < 1
                    ? false
                    : true
                }
                error={
                  (maxDepth && maxDepth > WEBCRAWLER_MAX_DEPTH) ||
                  (maxDepth && maxDepth < 1)
                    ? `Maximum depth must be between 1 and ${WEBCRAWLER_MAX_DEPTH}`
                    : null
                }
                name="maxDeph"
              />
            </Page.Layout>
            <Page.Layout direction="vertical" sizing="grow">
              <Page.SectionHeader
                title="Page Limit"
                description="What is the maximum number of pages you'd like to import?"
              />
              <Input
                placeholder={WEBCRAWLER_MAX_PAGES.toString()}
                value={maxPages?.toString() || ""}
                onChange={(value) => {
                  const parsed = parseInt(value);
                  if (!isNaN(parsed)) {
                    setMaxPages(parseInt(value));
                  } else if (value == "") {
                    setMaxPages(null);
                  }
                }}
                showErrorLabel={
                  maxPages &&
                  maxPages > WEBCRAWLER_MAX_PAGES &&
                  maxPages &&
                  maxPages < 1
                    ? false
                    : true
                }
                error={
                  (maxPages && maxPages > WEBCRAWLER_MAX_PAGES) ||
                  (maxPages && maxPages < 1)
                    ? `Maximum pages must be between 1 and ${WEBCRAWLER_MAX_PAGES}`
                    : null
                }
                name="maxPages"
              />
            </Page.Layout>
          </div>
        </Page.Layout>
      </div>
    </AppLayout>
  );
}
