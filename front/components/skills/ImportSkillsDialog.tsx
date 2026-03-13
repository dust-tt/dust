import { ImportFromRepositoryTab } from "@app/components/skills/ImportFromRepositoryTab";
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
import { useCallback, useRef, useState } from "react";

type ImportTab = "repository";

const IMPORT_TABS: readonly string[] = ["repository"] satisfies ImportTab[];

function isImportTab(value: string): value is ImportTab {
  return IMPORT_TABS.includes(value);
}

interface TabState {
  selectedCount: number;
  isDetecting: boolean;
  isImporting: boolean;
}

interface ImportSkillsDialogProps {
  onClose: () => void;
  owner: LightWorkspaceType;
}

const TAB_DESCRIPTION: Record<ImportTab, string> = {
  repository: "Enter a GitHub repository URL to detect skills.",
};

export function ImportSkillsDialog({
  onClose,
  owner,
}: ImportSkillsDialogProps) {
  const [activeTab, setActiveTab] = useState<ImportTab>("repository");
  const [tabState, setTabState] = useState<TabState>({
    selectedCount: 0,
    isDetecting: false,
    isImporting: false,
  });
  const importHandlerRef = useRef<(() => Promise<void>) | null>(null);

  const registerImportHandler = useCallback(
    (handler: () => Promise<void>) => {
      importHandlerRef.current = handler;
    },
    []
  );

  const handleImportClick = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      await importHandlerRef.current?.();
    },
    []
  );

  const { selectedCount, isDetecting, isImporting } = tabState;

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
          <Tabs
            value={activeTab}
            onValueChange={(value) => {
              if (isImportTab(value)) {
                setActiveTab(value);
              }
            }}
          >
            <TabsList>
              <TabsTrigger value="repository" label="Repository" />
            </TabsList>
            <TabsContent value="repository">
              <ImportFromRepositoryTab
                owner={owner}
                onStateChange={setTabState}
                onImportSuccess={onClose}
                registerImportHandler={registerImportHandler}
              />
            </TabsContent>
          </Tabs>
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
            onClick: handleImportClick,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
