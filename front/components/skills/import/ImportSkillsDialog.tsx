import type {
  ImportFormValues,
  ImportType,
} from "@app/components/skills/import/formSchema";
import { importFormSchema } from "@app/components/skills/import/formSchema";
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
import { useCallback, useState } from "react";
import { FormProvider, useController, useForm, useWatch } from "react-hook-form";

const IMPORT_TABS: ImportType[] = ["repository"];

function isImportTab(value: string): value is ImportType {
  return IMPORT_TABS.includes(value as ImportType);
}

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

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { importType: "repository", repoUrl: "", selectedSkillNames: [] },
  });

  const { field: importTypeField } = useController({ control: form.control, name: "importType" });
  const { field: selectedSkillNamesField } = useController({ control: form.control, name: "selectedSkillNames" });
  const activeTab = useWatch({ control: form.control, name: "importType" });
  const selectedSkillNames = useWatch({ control: form.control, name: "selectedSkillNames" });

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

  const selectedCount = selectedSkillNames.length;

  const description =
    detectedCount > 0
      ? `${detectedCount} skill${pluralize(detectedCount)} detected. Select the ones to import.`
      : TAB_DESCRIPTION[activeTab];

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
              value={activeTab}
              onValueChange={(value) => {
                if (isImportTab(value)) {
                  importTypeField.onChange(value);
                  selectedSkillNamesField.onChange([]);
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
