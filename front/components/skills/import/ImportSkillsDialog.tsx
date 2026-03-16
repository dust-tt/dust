import type {
  ImportFormValues,
  ImportType,
} from "@app/components/skills/import/formSchema";
import {
  importFormSchema,
  isImportType,
} from "@app/components/skills/import/formSchema";
import { ImportFromRepositoryTab } from "@app/components/skills/import/ImportFromRepositoryTab";
import { useImportSkills } from "@app/lib/swr/skill_configurations";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import { zodResolver } from "@hookform/resolvers/zod";
import { useCallback, useMemo, useState } from "react";
import { FormProvider, useController, useForm } from "react-hook-form";

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

const TAB_DESCRIPTION: Record<ImportType, string> = {
  repository: "Enter a GitHub repository URL to detect skills.",
};

export function ImportSkillsDialog({
  onClose,
  owner,
}: ImportSkillsDialogProps) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [detectedCount, setDetectedCount] = useState(0);

  const defaultValues = useMemo<ImportFormValues>(() => {
    return {
      importType: "repository",
      repoUrl: "",
      selectedSkillNames: [],
    };
  }, []);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues,
  });

  const { field: importTypeField } = useController({
    control: form.control,
    name: "importType",
  });
  const { field: selectedSkillNamesField } = useController({
    control: form.control,
    name: "selectedSkillNames",
  });

  const { importSkills, isImporting } = useImportSkills({ owner });

  const onSubmit = useCallback(
    async (data: ImportFormValues) => {
      if (data.selectedSkillNames.length === 0) {
        return;
      }
      const result = await importSkills(data.repoUrl, data.selectedSkillNames);
      if (result.successCount > 0) {
        onClose();
      }
    },
    [importSkills, onClose]
  );

  const selectedCount = selectedSkillNamesField.value.length;

  const description =
    detectedCount > 0
      ? `${detectedCount} skill${pluralize(detectedCount)} detected. Select the ones to import.`
      : TAB_DESCRIPTION[importTypeField.value];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>Import skills</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <FormProvider {...form}>
            <Tabs
              value={importTypeField.value}
              onValueChange={(value) => {
                if (isImportType(value)) {
                  importTypeField.onChange(value);
                  selectedSkillNamesField.onChange([]);
                  setDetectedCount(0);
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="repository" label="Repository" />
              </TabsList>
              <TabsContent value="repository">
                <ImportFromRepositoryTab
                  owner={owner}
                  onDetectingChange={setIsDetecting}
                  onDetectedCountChange={setDetectedCount}
                  isImporting={isImporting}
                />
              </TabsContent>
            </Tabs>
          </FormProvider>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            disabled: isDetecting || isImporting,
          }}
          rightButtonProps={{
            label: "Import",
            disabled: isImporting || selectedCount === 0,
            isLoading: isImporting,
            onClick: form.handleSubmit(onSubmit),
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
