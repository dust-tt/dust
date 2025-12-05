import { useCallback } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type {
  GetSkillEditorsResponseBody,
  PatchSkillEditorsRequestBody,
} from "@app/pages/api/w/[wId]/assistant/skill_configurations/[sId]/editors";
import type { LightWorkspaceType } from "@app/types";
import { pluralize } from "@app/types";

export function useSkillEditors({
  owner,
  skillConfigurationId,
  disabled,
}: {
  owner: LightWorkspaceType;
  skillConfigurationId: number | null;
  disabled?: boolean;
}) {
  const editorsFetcher: Fetcher<GetSkillEditorsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    skillConfigurationId !== null
      ? `/api/w/${owner.sId}/assistant/skill_configurations/${skillConfigurationId}/editors`
      : null,
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
  skillConfigurationId,
}: {
  owner: LightWorkspaceType;
  skillConfigurationId: number;
}) {
  const sendNotification = useSendNotification();
  const { mutateEditors } = useSkillEditors({
    owner,
    skillConfigurationId,
    disabled: true,
  });

  const updateSkillEditors = useCallback(
    async (body: PatchSkillEditorsRequestBody) => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/skill_configurations/${skillConfigurationId}/editors`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        void mutateEditors();

        let title = "";
        let description: string | undefined = undefined;
        if (
          body.addEditorIds != null &&
          body.addEditorIds.length > 0 &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          title = "Successfully update editors";
          description = "Successfully added and removed editors";
        } else if (
          (body.addEditorIds == null || body.addEditorIds.length <= 0) &&
          body.removeEditorIds != null &&
          body.removeEditorIds.length > 0
        ) {
          title = `Successfully removed editor${pluralize(body.removeEditorIds.length)}`;
        } else {
          title = `Successfully added editor${pluralize(
            body.addEditorIds?.length ?? 0
          )}`;
        }

        sendNotification({
          type: "success",
          title,
          description,
        });
      }
    },
    [owner, skillConfigurationId, mutateEditors, sendNotification]
  );

  return updateSkillEditors;
}
