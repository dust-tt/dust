import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import type {
  PatchDataSourceWithNameDocumentRequestBody,
  PostDataSourceWithNameDocumentRequestBody,
} from "@dust-tt/types";
import type { SWRMutationConfiguration } from "swr/mutation";
import useSWRMutation from "swr/mutation";

import { fetcherWithBody } from "@app/lib/swr/swr";
import type { PostDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents";
import type { PatchDocumentResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/documents/[documentId]";

async function sendPatchRequest(
  url: string,
  {
    arg,
  }: {
    arg: {
      documentBody: PatchDataSourceWithNameDocumentRequestBody;
    };
  }
) {
  const res = await fetcherWithBody([url, arg.documentBody, "PATCH"]);
  return res;
}

export function useUpdateDataSourceDocumentMutation(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  documentName: string,
  options?: SWRMutationConfiguration<PatchDocumentResponseBody, Error, string>
) {
  const patchUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/documents/${documentName}`;
  return useSWRMutation(patchUrl, sendPatchRequest, options);
}

async function sendPostRequest(
  url: string,
  {
    arg,
  }: {
    arg: {
      documentBody: PostDataSourceWithNameDocumentRequestBody;
    };
  }
) {
  const res = await fetcherWithBody([url, arg.documentBody, "POST"]);
  return res;
}

export function useCreateDataSourceDocumentMutation(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  options?: SWRMutationConfiguration<PostDocumentResponseBody, Error, string>
) {
  const createUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}/data_sources/${dataSourceView.dataSource.sId}/documents`;
  return useSWRMutation(createUrl, sendPostRequest, options);
}
