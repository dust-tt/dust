import { useActivePodId } from "@app/hooks/useActivePodId";
import { getSpaceIcon } from "@app/lib/spaces";
import { usePodFiles } from "@app/lib/swr/pods";
import { useSpaces } from "@app/lib/swr/spaces";
import { isManualPodFilesManagementAllowed } from "@app/lib/workspace_policies";
import { isProjectType, type PodType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Icon,
  ListGroup,
  ListItem,
  SearchInput,
  Spinner,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useMemo, useState } from "react";

type RefreshPodFiles = () => Promise<void>;

interface SavePageToPodDialogProps {
  owner: LightWorkspaceType;
  isOpen: boolean;
  onClose: () => void;
  onSelect: (podId: string) => Promise<boolean>;
  isSaving: boolean;
}

export function SavePageToPodDialog({
  owner,
  isOpen,
  onClose,
  onSelect,
  isSaving,
}: SavePageToPodDialogProps) {
  const activePodId = useActivePodId();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPodId, setSelectedPodId] = useState<string | null>(null);

  const {
    spaces: pods,
    isSpacesLoading: isPodsLoading,
    isSpacesError: isPodsError,
  } = useSpaces({
    kinds: ["project"],
    workspaceId: owner.sId,
    disabled: !isOpen,
  });
  const canManuallyManagePodFiles = isManualPodFilesManagementAllowed(owner);
  const isBusy = isSaving || selectedPodId !== null;

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedPodId(null);
    }
  }, [isOpen]);

  const filteredPods: PodType[] = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return pods.filter(
      (pod): pod is PodType =>
        isProjectType(pod) &&
        !pod.archivedAt &&
        pod.name.toLowerCase().includes(query)
    );
  }, [searchQuery, pods]);

  const activePod =
    activePodId !== null && searchQuery.trim() === ""
      ? filteredPods.find((pod) => pod.sId === activePodId)
      : null;
  const orderedPods = activePod
    ? [activePod, ...filteredPods.filter((pod) => pod.sId !== activePod.sId)]
    : filteredPods;

  const handleSelect = useCallback(
    async (pod: PodType, refreshPodFiles: RefreshPodFiles) => {
      setSelectedPodId(pod.sId);
      try {
        const saved = await onSelect(pod.sId);
        if (saved) {
          await refreshPodFiles();
          onClose();
        }
      } finally {
        setSelectedPodId(null);
      }
    },
    [onClose, onSelect]
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isBusy) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Save page to Pod</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-3">
            <SearchInput
              name="save-page-to-pod-search"
              placeholder="Search Pods"
              value={searchQuery}
              onChange={setSearchQuery}
              disabled={isBusy}
            />

            <div className="max-h-80 overflow-y-auto rounded-lg border-x border-border dark:border-border-night">
              <ListGroup>
                {isPodsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Spinner size="sm" />
                  </div>
                ) : isPodsError ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Failed to load Pods.
                  </div>
                ) : !canManuallyManagePodFiles ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    Adding files to Pods is disabled by your workspace admin.
                  </div>
                ) : filteredPods.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground dark:text-muted-foreground-night">
                    No Pods found.
                  </div>
                ) : (
                  orderedPods.map((pod) => (
                    <PodPickerListItem
                      key={pod.sId}
                      owner={owner}
                      pod={pod}
                      isSelected={selectedPodId === pod.sId}
                      isDisabled={isBusy || !canManuallyManagePodFiles}
                      onSelect={handleSelect}
                    />
                  ))
                )}
              </ListGroup>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter>
          <Button
            label="Cancel"
            variant="outline"
            onClick={onClose}
            disabled={isBusy}
          />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PodPickerListItem({
  owner,
  pod,
  isSelected,
  isDisabled,
  onSelect,
}: {
  owner: LightWorkspaceType;
  pod: PodType;
  isSelected: boolean;
  isDisabled: boolean;
  onSelect: (pod: PodType, refreshPodFiles: RefreshPodFiles) => Promise<void>;
}) {
  const { refreshPodFiles } = usePodFiles({
    owner,
    podId: pod.sId,
    disabled: true,
  });

  return (
    <ListItem
      itemsAlignment="center"
      onClick={
        isDisabled
          ? undefined
          : () => {
              void onSelect(pod, refreshPodFiles);
            }
      }
    >
      <Icon visual={getSpaceIcon(pod)} size="xs" />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="min-w-0 truncate font-medium">{pod.name}</span>
      </div>
      {isSelected && <Spinner size="xs" />}
    </ListItem>
  );
}
