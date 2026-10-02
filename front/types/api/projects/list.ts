import type { PodListItemType, PodType } from "@app/types/space";

export type SpacesLookupResponseBody = {
  spaces: PodType[];
};

export type SearchProjectsResponseBody = {
  spaces: PodListItemType[];
  hasMore: boolean;
  lastValue: string | null;
};
