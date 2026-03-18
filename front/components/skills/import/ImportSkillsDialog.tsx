import type {
  ImportFormValues,
  ImportType,
} from "@app/components/skills/import/formSchema";
import {
  importFormSchema,
  isImportType,
} from "@app/components/skills/import/formSchema";
import { ImportFromFilesTab } from "@app/components/skills/import/ImportFromFilesTab";
import { ImportFromRepositoryTab } from "@app/components/skills/import/ImportFromRepositoryTab";
import {
  useImportSkills,
  useImportSkillsFromFiles,
} from "@app/lib/swr/skill_configurations";
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
import { useCallback, useMemo, useRef, useState } from "react";
import { FormProvider, useController, useForm } from "react-hook-form";

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

const TAB_DESCRIPTION: Record<ImportType, string> = {
  repository: "Enter a GitHub repository URL to detect skills.",
  files: "Upload a .zip file with your skills.",
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

  const uploadedFilesRef = useRef<File[]>([]);
  const handleFilesChange = useCallback((files: File[]) => {
    uploadedFilesRef.current = files;
  }, []);

  const { importSkills, isImporting: isImportingFromRepo } = useImportSkills({
    owner,
  });
  const { importSkillsFromFiles, isImporting: isImportingFromFiles } =
    useImportSkillsFromFiles({ owner });

  const isImporting = isImportingFromRepo || isImportingFromFiles;

  const onSubmit = useCallback(
    async (data: ImportFormValues) => {
      if (data.selectedSkillNames.length === 0) {
        return;
      }

      let successCount = 0;
      switch (data.importType) {
        case "repository": {
          const result = await importSkills(
            data.repoUrl,
            data.selectedSkillNames
          );
          successCount = result.successCount;
          break;
        }
        case "files": {
          const result = await importSkillsFromFiles(
            uploadedFilesRef.current,
            data.selectedSkillNames
          );
          successCount = result.successCount;
          break;
        }
      }

      if (successCount > 0) {
        onClose();
      }
    },
    [importSkills, importSkillsFromFiles, onClose]
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
                }
              }}
            >
              <TabsList>
                <TabsTrigger value="repository" label="Repository" />
                <TabsTrigger value="files" label="Files" />
              </TabsList>
              <TabsContent value="repository">
                <ImportFromRepositoryTab
                  owner={owner}
                  isActive={importTypeField.value === "repository"}
                  onDetectingChange={setIsDetecting}
                  onDetectedCountChange={setDetectedCount}
                  isImporting={isImporting}
                />
              </TabsContent>
              <TabsContent value="files">
                <ImportFromFilesTab
                  owner={owner}
                  isActive={importTypeField.value === "files"}
                  onDetectingChange={setIsDetecting}
                  onDetectedCountChange={setDetectedCount}
                  onFilesChange={handleFilesChange}
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
