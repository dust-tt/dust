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
import { SkillImportLoading } from "@app/components/skills/import/SkillImportLoading";
import { useImportSkills } from "@app/lib/swr/skill_configurations";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
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
  files: "Upload a .zip or .skill file with your skills.",
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

  const { importSkills, isImporting } = useImportSkills({ owner });

  const onSubmit = useCallback(
    async (data: ImportFormValues) => {
      if (data.selectedSkillNames.length === 0) {
        return;
      }

      await importSkills(data, uploadedFilesRef.current);
      onClose();
    },
    [importSkills, onClose]
  );

  const selectedCount = selectedSkillNamesField.value.length;

  const description = isDetecting
    ? "Detecting skills..."
    : detectedCount > 0
      ? `${detectedCount} skill${pluralize(detectedCount)} detected. Select the ones to import.`
      : TAB_DESCRIPTION[importTypeField.value];

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !isImporting) {
          onClose();
        }
      }}
    >
      <DialogContent size="lg">
        <DialogHeader hideButton={isImporting}>
          <DialogTitle>
            {isImporting ? "Importing skills" : "Import skills"}
          </DialogTitle>
          <DialogDescription>
            {isImporting
              ? "Your skills are being added to the workspace."
              : description}
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          {isImporting ? (
            <SkillImportLoading
              importType={importTypeField.value}
              selectedCount={selectedCount}
            />
          ) : (
            <FormProvider {...form}>
              <Tabs
                value={importTypeField.value}
                onValueChange={(value) => {
                  if (isImportType(value)) {
                    importTypeField.onChange(value);
                    selectedSkillNamesField.onChange([]);
                    setDetectedCount(0);
                    form.setValue("repoUrl", "");
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
          )}
        </DialogContainer>
        {!isImporting && (
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
          >
            <Button
              label="Import"
              disabled={isDetecting || selectedCount === 0}
              onClick={form.handleSubmit(onSubmit)}
            />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
