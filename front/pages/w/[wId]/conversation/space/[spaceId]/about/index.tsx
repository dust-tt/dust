import { Button } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import type { ReactElement } from "react";
import React, { useCallback, useMemo, useState } from "react";

import type { ConversationLayoutProps } from "@app/components/assistant/conversation/ConversationLayout";
import { ConversationLayout } from "@app/components/assistant/conversation/ConversationLayout";
import type { MembersManagementType } from "@app/components/spaces/RestrictedAccessBody";
import { RestrictedAccessBody } from "@app/components/spaces/RestrictedAccessBody";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { useActiveSpaceId } from "@app/hooks/useActiveSpaceId";
import { useSpaceInfo, useUpdateSpace } from "@app/lib/swr/spaces";
import type { GroupType, UserType } from "@app/types";

import { getSpaceServerSideProps } from "../getServerSideProps";
import { SpaceTabsWrapper } from "../SpaceDetailsWrapper";

export const getServerSideProps = getSpaceServerSideProps;

export default function SpaceAbout({
  owner,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const spaceId = useActiveSpaceId();
  const [currentMembers, setCurrentMembers] = useState<UserType[]>([]);
  const [currentGroups, setCurrentGroups] = useState<GroupType[]>([]);
  const [currentManagementType, setCurrentManagementType] =
    useState<MembersManagementType>("manual");
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const { spaceInfo, mutateSpaceInfo } = useSpaceInfo({
    workspaceId: owner.sId,
    spaceId,
    includeAllMembers: true,
  });

  const doUpdate = useUpdateSpace({ owner });

  const handleChange = useCallback(
    (data: {
      groups: GroupType[];
      managementType: MembersManagementType;
      members: UserType[];
    }) => {
      setCurrentMembers(data.members);
      setCurrentGroups(data.groups);
      setCurrentManagementType(data.managementType);

      // Check if anything changed
      const membersChanged =
        JSON.stringify(data.members.map((m) => m.sId).sort()) !==
        JSON.stringify((spaceInfo?.members ?? []).map((m) => m.sId).sort());
      const managementTypeChanged =
        data.managementType !== (spaceInfo?.managementMode ?? "manual");

      setIsDirty(membersChanged || managementTypeChanged);
    },
    [spaceInfo]
  );

  const handleSave = useCallback(async () => {
    if (!spaceInfo) {
      return;
    }

    setIsSaving(true);

    if (currentManagementType === "group") {
      await doUpdate(spaceInfo, {
        groupIds: currentGroups.map((group) => group.sId),
        managementMode: "group",
        isRestricted: false,
        name: spaceInfo.name,
      });
    } else {
      await doUpdate(spaceInfo, {
        memberIds: currentMembers.map((member) => member.sId),
        managementMode: "manual",
        isRestricted: false,
        name: spaceInfo.name,
      });
    }

    await mutateSpaceInfo();
    setIsSaving(false);
    setIsDirty(false);
  }, [
    currentGroups,
    currentManagementType,
    currentMembers,
    doUpdate,
    mutateSpaceInfo,
    spaceInfo,
  ]);

  const planAllowsSCIM = false;

  const canSave = useMemo(() => {
    if (!isDirty) {
      return false;
    }

    if (currentManagementType === "manual") {
      return currentMembers.length > 0;
    } else {
      return currentGroups.length > 0;
    }
  }, [
    currentGroups.length,
    currentManagementType,
    currentMembers.length,
    isDirty,
  ]);

  return (
    <SpaceTabsWrapper owner={owner}>
      <div className="flex w-full flex-col gap-4 p-4">
        <RestrictedAccessBody
          planAllowsSCIM={planAllowsSCIM}
          owner={owner}
          initialMembers={spaceInfo?.members ?? []}
          initialGroups={[]}
          initialManagementType={spaceInfo?.managementMode ?? "manual"}
          onChange={handleChange}
        />
        <div className="flex justify-end">
          <Button
            label={isSaving ? "Saving..." : "Save"}
            onClick={handleSave}
            disabled={!canSave || isSaving}
            variant="primary"
            size="sm"
          />
        </div>
      </div>
    </SpaceTabsWrapper>
  );
}

SpaceAbout.getLayout = (
  page: ReactElement,
  pageProps: ConversationLayoutProps
) => {
  return (
    <AppRootLayout>
      <ConversationLayout pageProps={pageProps}>{page}</ConversationLayout>
    </AppRootLayout>
  );
};
