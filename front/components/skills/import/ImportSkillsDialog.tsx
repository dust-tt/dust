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
import { FormProvider, useForm } from "react-hook-form";

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
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [isDetecting, setIsDetecting] = useState(false);

  const form = useForm<ImportFormValues>({
    resolver: zodResolver(importFormSchema),
    defaultValues: { importType: "repository", repoUrl: "" },
  });

  const activeTab = form.watch("importType");

  const { importSkills, isImporting } = useImportSkills({ owner });

  const onSubmit = useCallback(
    async (data: ImportFormValues) => {
      if (selectedNames.size === 0) {
        return;
      }
      const result = await importSkills(data.repoUrl, [...selectedNames]);
      if (result.successCount > 0) {
        onClose();
      }
    },
    [selectedNames, importSkills, onClose]
  );

  const selectedCount = selectedNames.size;

  const description =
    selectedCount > 0
      ? `${selectedCount} skill${pluralize(selectedCount)} selected for import.`
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
                  form.setValue("importType", value);
                  setSelectedNames(new Set());
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="repository" label="Repository" />
              </TabsList>
              <TabsContent value="repository">
                <ImportFromRepositoryTab
                  owner={owner}
                  selectedNames={selectedNames}
                  setSelectedNames={setSelectedNames}
                  onDetectingChange={setIsDetecting}
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
