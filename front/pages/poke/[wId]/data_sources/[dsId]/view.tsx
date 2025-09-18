import { Input, Page, TextArea } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import config from "@app/lib/api/config";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import { classNames } from "@app/lib/utils";
import logger from "@app/logger/logger";
import type { CoreAPIDocument } from "@app/types";
import { CoreAPI } from "@app/types";

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

export default function DataSourceDocumentView({
  document,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  return (
    <div className="max-w-4xl">
      <div className="pt-6">
        <Page.Vertical align="stretch">
          <div className="pt-4">
            <Page.SectionHeader title="Document ID" />
            <div className="pt-4">
              <Input
                placeholder="Document ID"
                name="document"
                disabled={true}
                value={document.document_id}
              />
            </div>
          </div>

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
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
                  "text-normal block w-full min-w-0 flex-1 rounded-md font-mono",
                  "border-primary-200 bg-primary-50",
                  "focus:border-gray-300 focus:ring-0"
                )}
                disabled={true}
                // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
  );
}

DataSourceDocumentView.getLayout = (page: ReactElement) => {
  return <PokeLayout title="View Document">{page}</PokeLayout>;
};
