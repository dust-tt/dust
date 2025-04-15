import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  CreateTagResponseBody,
  GetTagsResponseBody,
} from "@app/pages/api/w/[wId]/tags";
import type { LightWorkspaceType } from "@app/types";

export function useTags({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const tagsFetcher: Fetcher<GetTagsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/tags`,
    tagsFetcher,
    {
      disabled,
    }
  );

  return {
    tags: useMemo(() => (data ? data.tags : []), [data]),
    isTagsLoading: !error && !data && !disabled,
    isTagsError: !!error,
    mutateTags: mutate,
  };
}

export function useCreateTag({ owner }: { owner: LightWorkspaceType }) {
  const addTag = async (name: string): Promise<CreateTagResponseBody> => {
    const res = await fetch(`/api/w/${owner.sId}/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });

    if (!res.ok) {
      const json = await res.json();
      throw new Error(json.error.message || "Failed to create tag");
    }

    return res.json();
  };

  return {
    addTag,
  };
}
