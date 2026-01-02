import {
  Avatar,
  InformationCircleIcon,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  UserGroupIcon,
} from "@dust-tt/sparkle";
import React, { useMemo, useState } from "react";

import { useDataSourceViewsContext } from "@app/components/agent_builder/DataSourceViewsContext";
import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { SkillDetailsButtonBar } from "@app/components/skills/SkillDetailsButtonBar";
import { SkillEditorsTab } from "@app/components/skills/SkillEditorsTab";
import { SkillInfoTab } from "@app/components/skills/SkillInfoTab";
import { hasRelations } from "@app/lib/skill";
import type { UserType, WorkspaceType } from "@app/types";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";

type SkillTabType = "info" | "editors";

interface SkillInfoPageProps {
  skill: SkillWithRelationsType;
  owner: WorkspaceType;
  user: UserType;
  onClose: () => void;
}

export function SkillInfoPage({
  skill,
  owner,
  user,
  onClose,
}: SkillInfoPageProps) {
  const [selectedTab, setSelectedTab] = useState<SkillTabType>("info");
  const showEditorsTabs = skill.canWrite;

  return (
    <div className="flex h-full flex-col gap-4">
      {skill.status !== "archived" && (
        <div className="-ml-1.5">
          <SkillDetailsButtonBar
            owner={owner}
            skill={skill}
            onClose={onClose}
          />
        </div>
      )}

      {showEditorsTabs ? (
        <Tabs value={selectedTab}>
          <TabsList border={false}>
            <TabsTrigger
              value="info"
              label="Info"
              icon={InformationCircleIcon}
              onClick={() => setSelectedTab("info")}
            />
            <TabsTrigger
              value="editors"
              label="Editors"
              icon={UserGroupIcon}
              onClick={() => setSelectedTab("editors")}
            />
          </TabsList>
          <div className="mt-4">
            <TabsContent value="info">
              <SkillInfoContent owner={owner} skill={skill} />
            </TabsContent>
            <TabsContent value="editors">
              {hasRelations(skill) && (
                <SkillEditorsTab skill={skill} owner={owner} user={user} />
              )}
            </TabsContent>
          </div>
        </Tabs>
      ) : (
        <SkillInfoContent owner={owner} skill={skill} />
      )}
    </div>
  );
}

function SkillInfoContent({
  owner,
  skill,
}: {
  owner: WorkspaceType;
  skill: SkillWithRelationsType;
}) {
  const { spaces } = useSpacesContext();
  const { supportedDataSourceViews, isDataSourceViewsLoading } =
    useDataSourceViewsContext();

  const editedAt = useMemo(() => {
    if (!skill.updatedAt) {
      return null;
    }
    return new Date(skill.updatedAt).toLocaleDateString("en-US", {
      year: "2-digit",
      month: "2-digit",
      day: "2-digit",
    });
  }, [skill.updatedAt]);

  const editedBy = useMemo(
    () => skill.relations.author?.fullName ?? null,
    [skill.relations.author?.fullName]
  );

  const editorsForAvatars = useMemo(() => {
    const seen = new Set<string>();
    const users: UserType[] = [];
    const maybePush = (u: UserType | null | undefined) => {
      if (!u || seen.has(u.sId)) {
        return;
      }
      seen.add(u.sId);
      users.push(u);
    };
    maybePush(skill.relations.author);
    for (const editor of skill.relations.editors ?? []) {
      maybePush(editor);
    }
    return users.slice(0, 3);
  }, [skill.relations.author, skill.relations.editors]);

  return (
    <div className="flex flex-col gap-4">
      {editedBy && editedAt && (
        <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground dark:text-muted-foreground-night">
          <div>
            Edited by {editedBy}, {editedAt}
          </div>
          {editorsForAvatars.length > 0 && (
            <div className="flex items-center -space-x-2">
              {editorsForAvatars.map((u) => (
                <Avatar key={u.sId} size="sm" visual={u.image} isRounded />
              ))}
            </div>
          )}
        </div>
      )}
      <SkillInfoTab
        owner={owner}
        skill={skill}
        showDescription
        spaces={spaces}
        dataSourceViews={supportedDataSourceViews}
        isDataSourceViewsLoading={isDataSourceViewsLoading}
      />
    </div>
  );
}
