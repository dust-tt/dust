import { useConversationSidePanelContext } from "@app/components/assistant/conversation/ConversationSidePanelContext";
import { ConversationSidePanelHeader } from "@app/components/assistant/conversation/ConversationSidePanelHeader";
import { SkillBuilderAgentFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderAgentFacingDescriptionSection";
import { SkillBuilderAvailabilitySection } from "@app/components/skill_builder/SkillBuilderAvailabilitySection";
import { SkillBuilderProvider } from "@app/components/skill_builder/SkillBuilderContext";
import { SkillBuilderEditorsSection } from "@app/components/skill_builder/SkillBuilderEditorsSection";
import { SkillBuilderFilesSection } from "@app/components/skill_builder/SkillBuilderFilesSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderIconSection } from "@app/components/skill_builder/SkillBuilderIconSection";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderNameSection } from "@app/components/skill_builder/SkillBuilderNameSection";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import { SkillBuilderUserFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderUserFacingDescriptionSection";
import { SkillVersionComparisonProvider } from "@app/components/skill_builder/SkillBuilderVersionContext";
import { SkillSpaceRestrictionsProvider } from "@app/components/skill_builder/SkillSpaceRestrictionsContext";
import {
  getDefaultSkillFormData,
  transformSkillTypeToFormData,
} from "@app/components/skill_builder/skillFormData";
import { RedactedSkillMessage } from "@app/components/skills/RedactedSkillMessage";
import { SkillLoadError } from "@app/components/skills/SkillDetailsBody";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import { useSkill } from "@app/lib/swr/skill_configurations";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import type { SkillWithRelationsType } from "@app/types/assistant/skill_configuration";
import { NEW_ENTITY_PANEL_KEY } from "@app/types/conversation_side_panel";
import type { UserType, WorkspaceType } from "@app/types/user";
import { ScrollArea, Spinner } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";

interface ConversationSkillBuilderPanelProps {
  readOnly: boolean;
}

export function ConversationSkillBuilderPanel({
  readOnly,
}: ConversationSkillBuilderPanelProps) {
  const owner = useWorkspace();
  const { user } = useAuth();
  const { closePanel, data } = useConversationSidePanelContext();

  const skillId = !data || data === NEW_ENTITY_PANEL_KEY ? null : data;

  const { skill, isSkillError, mutateSkill } = useSkill({
    workspaceId: owner.sId,
    skillId,
    withRelations: true,
    disabled: !skillId,
  });

  const { editors, isEditorsLoading } = useSkillEditors({
    owner,
    skillId,
    disabled: !skillId,
  });

  const isResolving = (skillId && !skill) || isEditorsLoading || !user;

  return (
    <div className="flex h-panel flex-col bg-panel-background">
      <ConversationSidePanelHeader onClose={closePanel}>
        <span className="text-sm font-medium text-foreground">
          {skill ? `Edit skill ${skill.name}` : "Create new skill"}
        </span>
      </ConversationSidePanelHeader>
      {isSkillError ? (
        <div className="px-4">
          <SkillLoadError onRetry={mutateSkill} />
        </div>
      ) : isResolving ? (
        <div className="flex h-full items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : skill && !skill.canRead ? (
        <div className="px-4">
          <RedactedSkillMessage skill={skill} owner={owner} />
        </div>
      ) : (
        <SkillBuilderPanelForm
          key={skill?.sId ?? NEW_ENTITY_PANEL_KEY}
          owner={owner}
          user={user}
          skill={skill}
          editors={editors}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

interface SkillBuilderPanelFormProps {
  owner: WorkspaceType;
  user: UserType;
  skill: SkillWithRelationsType | null;
  editors: SkillBuilderFormData["editors"];
  readOnly: boolean;
}

/**
 * @cc [owner:achilleburah,label:react;security] readonly-drives-form-disabled
 * The form MUST be created with react-hook-form's `disabled` set from `readOnly`. The builder
 * sections block edition solely by reading that flag back, so dropping it silently makes every
 * field writable.
 */
function SkillBuilderPanelForm({
  owner,
  user,
  skill,
  editors,
  readOnly,
}: SkillBuilderPanelFormProps) {
  const defaultValues = useMemo(() => {
    const base = skill
      ? transformSkillTypeToFormData(skill)
      : getDefaultSkillFormData({ user });

    return { ...base, editors: skill ? editors : [user] };
  }, [skill, editors, user]);

  const form = useForm<SkillBuilderFormData>({
    disabled: readOnly,
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues,
  });

  return (
    <SkillBuilderProvider
      owner={owner}
      user={user}
      skillId={skill?.sId ?? null}
    >
      <SkillBuilderFormContext.Provider value={form}>
        <FormProvider form={form} asForm={false}>
          <SkillVersionComparisonProvider>
            <SkillSpaceRestrictionsProvider
              initialRequestedSpaceIds={skill?.requestedSpaceIds}
            >
              <ScrollArea className="flex-1">
                <div className="space-y-8 p-4">
                  <div className="flex items-end gap-8">
                    <div className="flex-grow">
                      <SkillBuilderNameSection />
                    </div>
                    <SkillBuilderIconSection />
                  </div>
                  <SkillBuilderUserFacingDescriptionSection />
                  <SkillBuilderAgentFacingDescriptionSection />
                  <SkillBuilderInstructionsSection />
                  <SkillBuilderRequestedSpacesSection />
                  <SkillBuilderFilesSection />
                  <SkillBuilderEditorsSection
                    isEditorGateVisible={false}
                    isAddingSelfAsEditor={false}
                    onAddSelfAsEditor={() => {}}
                    owner={owner}
                  />
                  <SkillBuilderAvailabilitySection
                    owner={owner}
                    isReadOnly={readOnly}
                  />
                </div>
              </ScrollArea>
            </SkillSpaceRestrictionsProvider>
          </SkillVersionComparisonProvider>
        </FormProvider>
      </SkillBuilderFormContext.Provider>
    </SkillBuilderProvider>
  );
}
