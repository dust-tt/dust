import type { PodMetadataType } from "@app/types/project_metadata";

export type GetPodMetadataResponseBody = {
  projectMetadata: PodMetadataType | null;
};

export type PatchPodMetadataResponseBody = {
  projectMetadata: PodMetadataType;
};
