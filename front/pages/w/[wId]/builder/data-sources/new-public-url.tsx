import { Input, RadioButton } from "@dust-tt/sparkle";
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
      <div className="flex flex-col space-y-8 pb-16 pt-8">
        <div className="flex w-full flex-col gap-4">
          <div className="flex flex-row items-start gap-8">
            <div className="flex flex-col gap-4">
              <p className="text-lg font-bold text-element-900">
                Website public URL
              </p>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                URL of the website you want to crawl.{" "}
                <span className="font-medium text-element-900">
                  Public URL only.
                </span>
              </div>
              <div className="text-sm">
                <Input
                  placeholder="https://example.com/acticles"
                  value={dataSourceUrl}
                  onChange={(value) => setDataSourceUrl(value)}
                  error={dataSourceNameError}
                  name="dataSourceUrl"
                  showErrorLabel
                  className="text-sm"
                />
              </div>
              <p className="text-lg font-bold text-element-900">
                Crawling mode
              </p>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                Choose whether you want to crawl only pages that are children of
                the URL you provided or the entire website.
              </div>

              <div className="text-sm">
                <RadioButton
                  value={crawlMode}
                  onChange={(value) => {
                    setCrawlMode(value == "child" ? "child" : "website");
                  }}
                  name="crawlMode"
                  choices={[
                    {
                      label: "Only sub pages.",
                      value: "child",
                      disabled: false,
                    },
                    {
                      label: "The entire website.",
                      value: "website",
                      disabled: false,
                    },
                  ]}
                />
              </div>

              <p className="text-lg font-bold text-element-900">
                Maximum number of pages
              </p>

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
                size="sm"
                className="text-sm"
              />

              <p className="text-lg font-bold text-element-900">
                Maximum depth
              </p>
              <div className="flex-grow self-stretch text-sm font-normal text-element-700">
                Crawling depth determines how many levels deep, or links away
                from the starting page, our crawler will go to find content.
                Maximum value is 5.
              </div>
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
                size="sm"
                className="text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
