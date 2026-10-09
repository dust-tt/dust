import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  PatchSkillEditorsRequestBody,
  SkillEditorsLightResponseBody,
  SkillEditorsResponseBody,
} from "@app/types/api/skills/editors";
import type { LightWorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";
import type { Fetcher } from "swr";

export function useSkillEditors({
  owner,
  skillId,
  disabled,
}: {
  owner: LightWorkspaceType;
  skillId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const editorsFetcher: Fetcher<
    SkillEditorsResponseBody | SkillEditorsLightResponseBody
  > = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    skillId ? `/api/w/${owner.sId}/skills/${skillId}/editors` : null,

    editorsFetcher,
    {
      disabled,
    }
  );

  return {
    editors: data?.editors ?? emptyArray(),
    isEditorsLoading: !error && !data && !disabled,
    isEditorsError: !!error,
    mutateEditors: mutate,
  };
}

export function useUpdateSkillEditors({
  owner,
  skillId,
}: {
  owner: LightWorkspaceType;
  skillId: string | null;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const { mutateEditors } = useSkillEditors({
    owner,
    skillId,
    disabled: true,
  });

  const updateSkillEditors = useCallback(
    async (body: PatchSkillEditorsRequestBody) => {
      if (!skillId) {
        return false;
      }

      const res = await clientFetch(
        `/api/w/${owner.sId}/skills/${skillId}/editors`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        await mutateEditors();

        let title;
        let description: string | undefined = undefined;
        if (
          body.addEditorIds != null &&
          body.addEditorIds.length > 0 &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          title = t`Successfully updated editors`;
          description = t`Successfully added and removed editors`;
        } else if (
          (body.addEditorIds == null || body.addEditorIds.length <= 0) &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          const removedCount = body.removeEditorIds.length;
          title = t`${plural(removedCount, {
            one: "Successfully removed editor",
            other: "Successfully removed editors",
          })}`;
        } else {
          const addedCount = body.addEditorIds?.length ?? 0;
          title = t`${plural(addedCount, {
            one: "Successfully added editor",
            other: "Successfully added editors",
          })}`;
        }

        sendNotification({
          type: "success",
          title,
          description,
        });
        return true;
      }

      sendNotification({
        type: "error",
        title: t`Failed to update editors`,
      });
      return false;
    },
    [owner, skillId, mutateEditors, sendNotification, t]
  );

  return updateSkillEditors;
}
