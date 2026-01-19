import { Input, Page, Spinner, TextArea } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import { useSearchParams } from "next/navigation";
import type { ReactElement } from "react";

import PokeLayout from "@app/components/poke/PokeLayout";
import { withSuperUserAuthRequirements } from "@app/lib/iam/session";
import { classNames } from "@app/lib/utils";
import { usePokeDocument } from "@app/poke/swr/document";
import type { LightWorkspaceType } from "@app/types";
import { isString } from "@app/types";

export const getServerSideProps = withSuperUserAuthRequirements<{
  owner: LightWorkspaceType;
  params: { wId: string; dsId: string };
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();

  const { wId, dsId } = context.params ?? {};
  if (!isString(wId) || !isString(dsId)) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      owner,
      params: { wId, dsId },
    },
  };
});

export default function DataSourceDocumentView({
  owner,
  params,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { dsId } = params;
  const searchParams = useSearchParams();
  const documentId = searchParams?.get("documentId") ?? null;

  const {
    data: documentData,
    isLoading,
    isError,
  } = usePokeDocument({
    owner,
    dsId,
    documentId,
    disabled: false,
  });

  if (!documentId) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>No document ID provided.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !documentData) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading document.</p>
      </div>
    );
  }

  const { document } = documentData;

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

DataSourceDocumentView.getLayout = (
  page: ReactElement,
  { owner }: { owner: LightWorkspaceType }
) => {
  return (
    <PokeLayout title={`${owner.name} - View Document`}>{page}</PokeLayout>
  );
};
