import { BarFooter, BarHeader, Button, cn, ScrollArea } from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";

import { SkillBuilderAgentFacingDescriptionSection } from "@app/components/skill_builder/SkillBuilderAgentFacingDescriptionSection";
import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderRequestedSpacesSection } from "@app/components/skill_builder/SkillBuilderRequestedSpacesSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { SkillBuilderToolsSection } from "@app/components/skill_builder/SkillBuilderToolsSection";
import {
  getDefaultSkillFormData,
  transformSkillTypeToFormData,
} from "@app/components/skill_builder/skillFormData";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { ExtendedSkillBadge } from "@app/components/skills/ExtendedSkillBadge";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useNavigationLock } from "@app/hooks/useNavigationLock";
import { useSendNotification } from "@app/hooks/useNotification";
import { useSkillEditors } from "@app/lib/swr/skill_editors";
import type { SkillType } from "@app/types/assistant/skill_configuration";

interface SkillBuilderProps {
  skill?: SkillType;
  extendedSkill?: SkillType;
}

export default function SkillBuilder({
  skill,
  extendedSkill,
}: SkillBuilderProps) {
  const { owner, user } = useSkillBuilderContext();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const { editors } = useSkillEditors({
    owner,
    skillId: skill?.sId ?? null,
  });

  const defaultValues = useMemo(() => {
    if (skill) {
      return transformSkillTypeToFormData(skill);
    }

    return getDefaultSkillFormData({
      user,
      extendedSkillId: extendedSkill?.sId ?? null,
    });
  }, [skill, user, extendedSkill]);

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

  useNavigationLock(isDirty && !isSaving);

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
      skillId: !isCreatingNew ? skill?.sId : undefined,
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
            "flex h-dvh flex-row",
            "bg-background text-foreground",
            "dark:bg-background-night dark:text-foreground-night"
          )}
        >
          <div className="flex h-full w-full flex-col">
            <BarHeader
              variant="default"
              className="mx-4"
              title={skill ? `Edit skill ${skill.name}` : "Create new skill"}
              description={
                extendedSkill ? (
                  <ExtendedSkillBadge
                    extendedSkill={extendedSkill}
                    className="text-sm"
                  />
                ) : undefined
              }
              rightActions={
                <BarHeader.ButtonBar variant="close" onClose={handleCancel} />
              }
            />

            <ScrollArea className="flex-1">
              <div className="mx-auto space-y-10 p-4 2xl:max-w-5xl">
                {!extendedSkill && (
                  <div>
                    <h2 className="heading-lg text-foreground dark:text-foreground-night">
                      Create new skill
                    </h2>
                    <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                      Create a package of instructions and tools that agents can
                      share.
                    </p>
                  </div>
                )}
                <SkillBuilderRequestedSpacesSection />
                <SkillBuilderAgentFacingDescriptionSection />
                <SkillBuilderInstructionsSection skill={skill} />
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
