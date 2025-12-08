import {
  BarFooter,
  BarHeader,
  Button,
  cn,
  ScrollArea,
  XMarkIcon,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import type { BuilderAction } from "@app/components/shared/tools_picker/types";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { SkillBuilderDescriptionSection } from "@app/components/skill_builder/SkillBuilderDescriptionSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { SkillBuilderToolsSection } from "@app/components/skill_builder/SkillBuilderToolsSection";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import {
  getDefaultSkillFormData,
  transformDuplicateSkillToFormData,
  transformSkillConfigurationToFormData,
} from "@app/components/skill_builder/transformSkillConfiguration";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
<<<<<<< HEAD
import { useSkillConfigurationTools } from "@app/lib/swr/actions";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import { emptyArray } from "@app/lib/swr/swr";
import type { SkillConfigurationType } from "@app/types/skill_configuration";

function processActionsFromStorage(actions: BuilderAction[]): BuilderAction[] {
  return actions;
}

interface SkillBuilderProps {
  skillConfiguration?: SkillConfigurationType;
=======
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import type { SkillConfiguration } from "@app/types/skill_configuration";

interface SkillBuilderProps {
  skillConfiguration?: SkillConfiguration;
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
  duplicateSkillId?: string | null;
}

export default function SkillBuilder({
  skillConfiguration,
  duplicateSkillId,
}: SkillBuilderProps) {
  const { owner, user } = useSkillBuilderContext();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

<<<<<<< HEAD
  const { actions, isActionsLoading } = useSkillConfigurationTools(
    owner.sId,
    skillConfiguration?.sId ?? null
  );

=======
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
  const { editors } = useSkillEditors({
    owner,
    skillConfigurationId: skillConfiguration?.sId ?? null,
  });

<<<<<<< HEAD
  const processedActions = useMemo(() => {
    return processActionsFromStorage(actions ?? emptyArray());
  }, [actions]);

=======
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
  const defaultValues = useMemo(() => {
    if (duplicateSkillId && skillConfiguration) {
      return transformDuplicateSkillToFormData(skillConfiguration, user);
    }

    if (skillConfiguration) {
      return transformSkillConfigurationToFormData(skillConfiguration);
    }

    return getDefaultSkillFormData({ user });
  }, [skillConfiguration, duplicateSkillId, user]);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues,
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

<<<<<<< HEAD
  // Populate editors and tools reactively
=======
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
  useEffect(() => {
    const currentValues = form.getValues();

    form.reset({
      ...currentValues,
<<<<<<< HEAD
      tools: processedActions,
=======
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)
      editors: duplicateSkillId
        ? [user]
        : skillConfiguration || editors.length > 0
          ? editors
          : [user],
    });
<<<<<<< HEAD
  }, [
    isActionsLoading,
    processedActions,
    editors,
    form,
    duplicateSkillId,
    user,
    skillConfiguration,
  ]);
=======
  }, [editors, form, duplicateSkillId, user, skillConfiguration]);
>>>>>>> c8ec270dd6 ([skill_builder] - feature: enhance SkillBuilder to support editing and duplicating skills)

  const isCreatingNew = duplicateSkillId || !skillConfiguration;
  const { isDirty } = form.formState;

  useNavigationLock((isDirty || !!duplicateSkillId) && !isSaving);

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
      user,
      skillConfigurationId: !isCreatingNew
        ? skillConfiguration?.sId
        : undefined,
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

    if (isCreatingNew && result.value.sId) {
      const newUrl = `/w/${owner.sId}/builder/skills/${result.value.sId}`;
      await router.replace(newUrl, undefined, { shallow: true });
    } else {
      form.reset(form.getValues(), { keepValues: true });
    }

    setIsSaving(false);
  };

  const handleCancel = async () => {
    await appLayoutBack(owner, router);
  };

  const handleSave = () => {
    void form.handleSubmit(handleSubmit)();
  };

  return (
    <SkillBuilderFormContext.Provider value={form}>
      <FormProvider form={form} asForm={false}>
        <div
          className={cn(
            "h-dvh flex flex-row",
            "bg-background text-foreground",
            "dark:bg-background-night dark:text-foreground-night"
          )}
        >
          <div className="flex h-full w-full flex-col">
            <BarHeader
              variant="default"
              className="mx-4"
              title={
                skillConfiguration
                  ? duplicateSkillId
                    ? `Duplicate ${skillConfiguration.name}`
                    : `Edit skill ${skillConfiguration.name}`
                  : "Create new skill"
              }
              rightActions={
                <Button
                  icon={XMarkIcon}
                  onClick={handleCancel}
                  variant="ghost"
                  type="button"
                />
              }
            />

            <ScrollArea className="flex-1">
              <div className="mx-auto space-y-10 p-4 2xl:max-w-5xl">
                <div>
                  <h2 className="heading-lg text-foreground dark:text-foreground-night">
                    Create new skill
                  </h2>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Create custom capabilities for specific tasks
                  </p>
                </div>
                <SkillBuilderDescriptionSection />
                <SkillBuilderInstructionsSection />
                <SkillBuilderToolsSection />
                <SkillBuilderSettingsSection />
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
        </div>
      </FormProvider>
    </SkillBuilderFormContext.Provider>
  );
}
