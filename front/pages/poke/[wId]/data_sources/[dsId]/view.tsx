import { Input, Page, TextArea } from "@dust-tt/sparkle";
import type { CoreAPIDocument } from "@dust-tt/types";
import { CoreAPI } from "@dust-tt/types";
import type { InferGetServerSidePropsType } from "next";

import PokeNavbar from "@app/components/poke/PokeNavbar";
import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";

export const getServerSideProps = withSuperUserAuthRequirements<{
  document: CoreAPIDocument;
}>(async (context, auth) => {
  const { dsId } = context.params || {};
  if (typeof dsId !== "string") {
    return {
      notFound: true,
    };
  }

  const dataSource = await DataSourceResource.fetchById(auth, dsId, {
    includeEditedBy: true,
  });
  if (!dataSource) {
    return {
      notFound: true,
    };
  }

  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
  const document = await coreAPI.getDataSourceDocument({
    projectId: dataSource.dustAPIProjectId,
    dataSourceId: dataSource.dustAPIDataSourceId,
    documentId: context.query.documentId as string,
  });

  if (document.isErr()) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      document: document.value.document,
    },
  };
});

export default function DataSourceUpsert({
  document,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="min-h-screen bg-structure-50">
      <PokeNavbar />
      <div className="mx-auto max-w-4xl">
        <div className="pt-6">
          <Page.Vertical align="stretch">
            <div className="pt-4">
              <Page.SectionHeader title="Document title" />
              <div className="pt-4">
                <Input
                  placeholder="Document title"
                  name="document"
                  disabled={true}
                  value={document.document_id}
                />
              </div>
            </div>

            <div className="pt-4">
              <Page.SectionHeader title="Source URL" />
              <div className="pt-4">
                <Input
                  placeholder=""
                  name="document"
                  disabled={true}
                  value={document.source_url || ""}
                />
              </div>
            </div>

            <div className="pt-4">
              <Page.SectionHeader title="Text content" />
              <div className="pt-4">
                <TextArea
                  name="text"
                  id="text"
                  rows={20}
                  readOnly={true}
                  className={classNames(
                    "font-mono text-normal block w-full min-w-0 flex-1 rounded-md",
                    "border-structure-200 bg-structure-50",
                    "focus:border-gray-300 focus:ring-0"
                  )}
                  disabled={true}
                  value={document.text || ""}
                />
              </div>
            </div>

            <div className="pt-4">
              <Page.SectionHeader title="Tags" />
              <div className="pt-4">
                {document.tags.map((tag, index) => (
                  <div key={index} className="flex flex-grow flex-row">
                    <div className="flex flex-1 flex-row gap-8">
                      <div className="flex flex-1 flex-col">
                        <Input
                          className="w-full"
                          placeholder="Tag"
                          name="tag"
                          disabled={true}
                          value={tag}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Page.Vertical>
        </div>
      </div>
    </div>
  );
}
