import type { PodType } from "@app/types/space";

export type SpacesLookupResponseBody = {
  spaces: PodType[];
};

export type SearchProjectsResponseBody = {
  spaces: Array<PodType & { isMember: boolean }>;
  hasMore: boolean;
  lastValue: string | null;
};
