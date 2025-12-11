import {
  Button,
  Input,
  Page,
  PencilSquareIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@dust-tt/sparkle";
import { useCallback, useEffect, useState } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { WorkspaceType } from "@app/types";

export function WorkspaceNameEditor({ owner }: { owner: WorkspaceType }) {
  const [disable, setDisabled] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [workspaceName, setWorkspaceName] = useState(owner.name);
  const [workspaceNameError, setWorkspaceNameError] = useState<string>("");
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const formValidation = useCallback(() => {
    if (workspaceName === owner.name) {
      return false;
    }
    let valid = true;

    if (workspaceName.length === 0) {
      setWorkspaceNameError("");
      valid = false;
      // eslint-disable-next-line no-useless-escape
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        "Workspace name must only contain letters, numbers, and the characters `._-`"
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  }, [owner.name, workspaceName]);

  useEffect(() => {
    setDisabled(!formValidation());
  }, [workspaceName, formValidation]);

  const handleUpdateWorkspace = async () => {
    setUpdating(true);
    const res = await clientFetch(`/api/w/${owner.sId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: workspaceName,
      }),
    });
    if (!res.ok) {
      window.alert("Failed to update workspace.");
      setUpdating(false);
    } else {
      setIsSheetOpen(false);
      // We perform a full refresh so that the Workspace name updates, and we get a fresh owner
      // object so that the formValidation logic keeps working.
      window.location.reload();
    }
  };

  const handleCancel = () => {
    setWorkspaceName(owner.name);
    setWorkspaceNameError("");
    setIsSheetOpen(false);
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <Page.H variant="h4">Workspace Name</Page.H>
        <Page.P variant="secondary">{owner.name}</Page.P>
      </div>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" label="Edit" icon={PencilSquareIcon} />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Edit Workspace Name</SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="mt-6 flex flex-col gap-4">
              <Page.P>
                Think GitHub repository names, short and memorable.
              </Page.P>
              <Input
                name="name"
                placeholder="Workspace name"
                value={workspaceName}
                onChange={(e) => setWorkspaceName(e.target.value)}
                message={workspaceNameError}
                messageStatus="error"
              />
            </div>
          </SheetContainer>
          <SheetFooter
            leftButtonProps={{
              onClick: handleCancel,
              variant: "outline",
              label: "Cancel",
            }}
            rightButtonProps={{
              onClick: handleUpdateWorkspace,
              variant: "primary",
              label: updating ? "Saving..." : "Save",
              disabled: disable || updating,
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  );
}
