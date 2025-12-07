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
import { useState } from "react";
import { useForm } from "react-hook-form";

import { useSkillBuilderContext } from "@app/components/skill_builder/SkillBuilderContext";
import { SkillBuilderDescriptionSection } from "@app/components/skill_builder/SkillBuilderDescriptionSection";
import type { SkillBuilderFormData } from "@app/components/skill_builder/SkillBuilderFormContext";
import {
  SkillBuilderFormContext,
  skillBuilderFormSchema,
} from "@app/components/skill_builder/SkillBuilderFormContext";
import { SkillBuilderInstructionsSection } from "@app/components/skill_builder/SkillBuilderInstructionsSection";
import { SkillBuilderSettingsSection } from "@app/components/skill_builder/SkillBuilderSettingsSection";
import { submitSkillBuilderForm } from "@app/components/skill_builder/submitSkillBuilderForm";
import { appLayoutBack } from "@app/components/sparkle/AppContentLayout";
import { FormProvider } from "@app/components/sparkle/FormProvider";
import { useSendNotification } from "@app/hooks/useNotification";

export default function SkillBuilder() {
  const { owner } = useSkillBuilderContext();
  const router = useRouter();
  const sendNotification = useSendNotification();
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<SkillBuilderFormData>({
    resolver: zodResolver(skillBuilderFormSchema),
    defaultValues: {
      name: "",
      description: "",
      instructions: "",
    },
  });

  const handleSubmit = async (data: SkillBuilderFormData) => {
    setIsSaving(true);

    const result = await submitSkillBuilderForm({
      formData: data,
      owner,
    });

    if (result.isErr()) {
      sendNotification({
        title: "Error creating skill",
        description: result.error.message,
        type: "error",
      });
      setIsSaving(false);
      return;
    }

    sendNotification({
      title: "Skill created",
      description: "Your skill has been successfully created.",
      type: "success",
    });

    await appLayoutBack(owner, router);
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
              title="Create new skill"
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
                <SkillBuilderDescriptionSection />
                <SkillBuilderInstructionsSection />
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
