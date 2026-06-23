import {
  BuilderEditorGateMessage,
  BuilderEditorLoadErrorMessage,
} from "@app/components/shared/BuilderEditorGateMessage";
import { SkillBuilderAgentFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderAgentFacingDescriptionSection";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { SkillBuilderFilesSection } from "@app/components/skill_builder/SkillBuilderFilesSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { SkillBuilderSuggestionsPanel } from "@app/components/skill_builder/SkillBuilderSuggestionsPanel";
import { SkillVersionHistoryPicker } from "@app/components/skill_builder/SkillBuilderVersionComparisonBanner";
import { SkillBuilderVersionComparisonFooter } from "@app/components/skill_builder/SkillBuilderVersionComparisonFooter";
import {
  SkillVersionComparisonProvider,
  useSkillVersionComparisonContext,
} from "@app/components/skill_builder/SkillBuilderVersionContext";
import {
  getDefaultSkillFormData,
  transformSkillTypeToFormData,
} from "@app/components/skill_builder/skillFormData";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSkillSuggestions } from "@app/hooks/useSkillSuggestions";
import { useIsSelfImprovementAvailable } from "@app/lib/client/self_improvement";
import { useAppRouter } from "@app/lib/platform";
import { useSkillHistory } from "@app/lib/swr/skill_configurations";
import {
  useSkillEditors,
  useUpdateSkillEditors,
} from "@app/lib/swr/skill_editors";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { getConversationRoute } from "@app/lib/utils/router";
import type { SkillType } from "@app/types/assistant/skill_configuration";
import { isAdmin } from "@app/types/user";
import {
  BarFooter,
  BarHeader,
  Button,
  ContentMessage,
  cn,
  InfoCircle,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  ScrollArea,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

interface SkillBuilderProps {
  skill?: SkillType;
  onSaved: () => void;
}

export default function SkillBuilder({ skill, onSaved }: SkillBuilderProps) {
  const { owner, user } = useSkillBuilderContext();
  const router = useAppRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);
  const [isAddingSelfAsEditor, setIsAddingSelfAsEditor] = useState(false);
  const isMobile = useIsMobile();

  const { editors, isEditorsError, isEditorsLoading, mutateEditors } =
    useSkillEditors({
      owner,
      skillId: skill?.sId ?? null,
    });
  const updateSkillEditors = useUpdateSkillEditors({
    owner,
    skillId: skill?.sId ?? null,
  });

  const { skillHistory } = useSkillHistory({
    owner,
    skill,
    disabled: !skill,
    limit: 30,
  });

  const hasSelfImprovingSkills = useIsSelfImprovementAvailable();

  const { suggestions } = useSkillSuggestions({
    skillId: skill?.sId ?? null,
    states: ["pending"],
    workspaceId: owner.sId,
    disabled: !skill || !hasSelfImprovingSkills,
  });

  const hasPendingSuggestions = suggestions.length > 0;

  const defaultValues = useMemo(() => {
    if (skill) {
      return transformSkillTypeToFormData(skill);
    }

    return getDefaultSkillFormData({
      user,
    });
  }, [skill, user]);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  // Populate editors reactively
  useEffect(() => {
    const currentValues = form.getValues();

    form.reset({
      ...currentValues,
      editors: skill || editors.length > 0 ? editors : [user],
    });
  }, [editors, form, user, skill]);

  const isCreatingNew = !skill;
  const { isDirty } = form.formState;

  const isAdminExistingSkill = !!skill && isAdmin(owner);
  const isCurrentUserEditor = editors.some((editor) => editor.sId === user.sId);
  const isAdminNonEditor =
    isAdminExistingSkill &&
    !isEditorsLoading &&
    !isEditorsError &&
    !isCurrentUserEditor;
  const isEditorLocked =
    isAdminExistingSkill &&
    (isEditorsLoading || isEditorsError || !isCurrentUserEditor);

  useNavigationLock(isDirty && !isSaving);

  const handleAddSelfAsEditor = async () => {
    if (!skill || isAddingSelfAsEditor) {
      return;
    }

    setIsAddingSelfAsEditor(true);
    try {
      await updateSkillEditors({ addEditorIds: [user.sId] });
    } finally {
      setIsAddingSelfAsEditor(false);
    }
  };

  const handleSubmit = async (data: SkillBuilderFormData) => {
    if (isEditorLocked) {
      return;
    }

    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
      skillId: skill?.sId,
      currentEditors: editors,
    });

    if (result.isErr()) {
      sendNotification({
        title: isCreatingNew ? "Error creating skill" : "Error updating skill",
        description: result.error.message,
        type: "error",
      });
      setIsSaving(false);
      return;
    }

    sendNotification({
      title: isCreatingNew ? "Skill created" : "Skill updated",
      description: isCreatingNew
        ? "Your skill has been successfully created."
        : "Your skill has been successfully updated.",
      type: "success",
    });

    onSaved();

    if (isCreatingNew && result.value.sId) {
      const newUrl = `/w/${owner.sId}/builder/skills/${result.value.sId}`;
      await router.replace(newUrl, undefined, { shallow: true });
    } else {
      form.reset(form.getValues(), { keepValues: true });
    }

    setIsSaving(false);
  };

  const handleCancel = () => {
    if (window.history.state?.idx > 0) {
      router.back();
    } else {
      void router.replace(getConversationRoute(owner.sId));
    }
  };

  const handleSave = () => {
    if (isEditorLocked) {
      if (isEditorsError) {
        sendNotification({
          title: "Unable to verify editor access",
          description: "Retry loading editors before saving changes.",
          type: "error",
        });
        return;
      }

      if (isEditorsLoading) {
        sendNotification({
          title: "Verifying editor access",
          description: "Wait until skill editors finish loading before saving.",
          type: "error",
        });
        return;
      }

      sendNotification({
        title: "Cannot save skill",
        description: "Only skill editors can save changes.",
        type: "error",
      });
      return;
    }

    void form.handleSubmit(handleSubmit)();
  };

  const showSuggestionsPanel =
    skill && !isMobile && hasSelfImprovingSkills && hasPendingSuggestions;

  const leftPanel = (
    <div className="flex h-full w-full flex-col">
      <BarHeader
        variant="default"
        className="mx-4"
        title={skill ? `Edit skill ${skill.name}` : "Create new skill"}
        centerActions={
          skill && skillHistory && !hasPendingSuggestions ? (
            <SkillVersionHistoryPicker
              skill={skill}
              skillHistory={skillHistory}
            />
          ) : undefined
        }
        rightActions={
          <div className="flex items-center gap-2">
            <BarHeader.ButtonBar variant="close" onClose={handleCancel} />
          </div>
        }
      />

      <ScrollArea className="flex-1">
        <div className="mx-auto space-y-10 p-8 2xl:max-w-5xl">
          {isAdminExistingSkill && isEditorsError ? (
            <BuilderEditorLoadErrorMessage
              builderType="skill"
              onRetry={() => {
                void mutateEditors();
              }}
            />
          ) : isAdminNonEditor ? (
            <BuilderEditorGateMessage
              builderType="skill"
              isLoading={isAddingSelfAsEditor}
              onAddSelfAsEditor={() => {
                void handleAddSelfAsEditor();
              }}
            />
          ) : null}
          {skill?.status === "suggested" && (
            <ContentMessage
              title="This is a generated skill suggestion"
              variant="primary"
              icon={InfoCircle}
              size="lg"
            >
              This skill was automatically generated based on your workspace's
              configuration. We recommend reviewing and editing it to match your
              specific needs before saving.
            </ContentMessage>
          )}
          <SkillBuilderAgentFacingDescriptionSection />
          <SkillBuilderInstructionsSection />
          <SkillBuilderRequestedSpacesSection
            initialRequestedSpaceIds={skill?.requestedSpaceIds}
          />
          <SkillBuilderFilesSection disableUpload={isEditorLocked} />
          <SkillBuilderSettingsOrComparisonFooter
            skill={skill}
            hasSelfImprovingSkills={hasSelfImprovingSkills}
          />
        </div>
      </ScrollArea>
      <BarFooter
        variant="default"
        className="mx-4 justify-between"
        leftActions={
          <Button
            variant="outline"
            label="Cancel"
            onClick={handleCancel}
            type="button"
          />
        }
        rightActions={
          <Button
            variant="highlight"
            label={isSaving ? "Saving..." : "Save"}
            onClick={handleSave}
            disabled={isSaving}
          />
        }
      />
    </div>
  );

  return (
    <SkillBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <SkillVersionComparisonProvider>
          <div
            className={cn(
              "flex h-dvh flex-row",
              "bg-background text-foreground",
              "dark:bg-background-night dark:text-foreground-night"
            )}
          >
            {showSuggestionsPanel ? (
              <ResizablePanelGroup
                id="skill-builder-layout"
                direction="horizontal"
                className="h-full w-full"
              >
                <ResizablePanel defaultSize={65} minSize={40}>
                  <div className="h-full w-full overflow-y-auto">
                    {leftPanel}
                  </div>
                </ResizablePanel>

                <>
                  <ResizableHandle withHandle />
                  <ResizablePanel defaultSize={35} minSize={20} maxSize={50}>
                    <div className="h-full w-full overflow-y-auto">
                      <SkillBuilderSuggestionsPanel disabled={isEditorLocked} />
                    </div>
                  </ResizablePanel>
                </>
              </ResizablePanelGroup>
            ) : (
              leftPanel
            )}
          </div>
        </SkillVersionComparisonProvider>
      </FormProvider>
    </SkillBuilderFormContext.Provider>
  );
}

function SkillBuilderSettingsOrComparisonFooter({
  skill,
  hasSelfImprovingSkills,
}: {
  skill?: SkillType;
  hasSelfImprovingSkills: boolean;
}) {
  const { compareVersion } = useSkillVersionComparisonContext();

  if (compareVersion) {
    return <SkillBuilderVersionComparisonFooter />;
  }

  return (
    <SkillBuilderSettingsSection
      skill={skill}
      hasSelfImprovingSkills={hasSelfImprovingSkills}
    />
  );
}
