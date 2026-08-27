import { useAllowSlackWorkflow } from "@app/lib/swr/slack_workflows";
import { useSpacesAsAdmin } from "@app/lib/swr/spaces";
import { GLOBAL_SPACE_NAME } from "@app/types/groups";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearchbar,
  DropdownMenuTrigger,
  Input,
  Label,
  Spinner,
  XClose,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

interface SelectedSpace {
  sId: string;
  name: string;
}

interface AllowSlackWorkflowDialogProps {
  isOpen: boolean;
  onClose: () => void;
  owner: LightWorkspaceType;
}

export function AllowSlackWorkflowDialog({
  isOpen,
  onClose,
  owner,
}: AllowSlackWorkflowDialogProps) {
  const [botName, setBotName] = useState("");
  const [selectedSpaces, setSelectedSpaces] = useState<SelectedSpace[]>([]);
  const [spaceSearch, setSpaceSearch] = useState("");
  const [isSpaceMenuOpen, setIsSpaceMenuOpen] = useState(false);

  const { spaces, isSpacesLoading } = useSpacesAsAdmin({
    workspaceId: owner.sId,
    disabled: !isSpaceMenuOpen,
  });
  const { doAllowSlackWorkflow, isAllowing } = useAllowSlackWorkflow({ owner });

  const selectableSpaces = useMemo(
    () =>
      spaces
        .filter((space) => space.kind === "regular" || space.kind === "project")
        .sort((a, b) => a.name.localeCompare(b.name)),
    [spaces]
  );

  const searchedSpaces = useMemo(() => {
    const search = spaceSearch.trim().toLowerCase();
    const selectedIds = new Set(selectedSpaces.map((space) => space.sId));
    return selectableSpaces.filter(
      (space) =>
        !selectedIds.has(space.sId) && space.name.toLowerCase().includes(search)
    );
  }, [selectableSpaces, selectedSpaces, spaceSearch]);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setBotName("");
      setSelectedSpaces([]);
      setSpaceSearch("");
      setIsSpaceMenuOpen(false);
      onClose();
    }
  };

  const handleAllow = async () => {
    const allowed = await doAllowSlackWorkflow({
      botName: botName.trim(),
      spaceIds: selectedSpaces.map((space) => space.sId),
    });
    if (allowed) {
      handleOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Allow a Slack workflow</DialogTitle>
          <DialogDescription>
            Anyone who can run the workflow in Slack will be able to summon
            agents through it, guests included.
          </DialogDescription>
        </DialogHeader>
        <DialogContainer>
          <div className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label>Workflow name</Label>
              <Input
                placeholder="e.g. Weekly report"
                value={botName}
                onChange={(e) => setBotName(e.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                The sender name Slack shows on the workflow's messages. It has
                to match exactly, spelling and capitalization included.
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Spaces it can reach</Label>
              <div>
                <DropdownMenu
                  open={isSpaceMenuOpen}
                  onOpenChange={setIsSpaceMenuOpen}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      label="Add spaces"
                      size="sm"
                      isSelect
                    />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="w-72"
                    align="start"
                    dropdownHeaders={
                      <DropdownMenuSearchbar
                        name="slackWorkflowSpaceSearch"
                        placeholder="Search spaces"
                        value={spaceSearch}
                        onChange={setSpaceSearch}
                      />
                    }
                  >
                    {isSpacesLoading && (
                      <div className="flex items-center justify-center py-4">
                        <Spinner size="sm" />
                      </div>
                    )}
                    {!isSpacesLoading && searchedSpaces.length === 0 && (
                      <div className="flex items-center justify-center py-4 text-sm">
                        No space found
                      </div>
                    )}
                    {searchedSpaces.map((space) => (
                      <DropdownMenuItem
                        key={space.sId}
                        label={space.name}
                        onSelect={(e) => e.preventDefault()}
                        onClick={() =>
                          setSelectedSpaces([
                            ...selectedSpaces,
                            { sId: space.sId, name: space.name },
                          ])
                        }
                      />
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div className="flex flex-wrap gap-1">
                <Button
                  label={GLOBAL_SPACE_NAME}
                  size="xs"
                  variant="outline"
                  disabled
                />
                {selectedSpaces.map((space) => (
                  <Button
                    key={space.sId}
                    label={space.name}
                    icon={XClose}
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      setSelectedSpaces(
                        selectedSpaces.filter(
                          (selected) => selected.sId !== space.sId
                        )
                      )
                    }
                  />
                ))}
              </div>
              <span className="text-xs text-muted-foreground">
                {`The workflow always reaches agents shared in ${GLOBAL_SPACE_NAME}. Add spaces to let it summon their agents too.`}
              </span>
            </div>
          </div>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Allow",
            variant: "primary",
            onClick: handleAllow,
            disabled: botName.trim().length === 0,
            isLoading: isAllowing,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
