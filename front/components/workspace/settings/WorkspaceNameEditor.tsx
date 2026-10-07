import { AdminSectionAnchor } from "@app/components/layouts/AdminSectionAnchor";
import { ADMIN_SECTION_IDS } from "@app/lib/admin/adminSectionIds";
import { clientFetch } from "@app/lib/egress/client";
import type { WorkspaceType } from "@app/types/user";
import {
  Button,
  Edit04,
  Input,
  Page,
  SettingsList,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

export function WorkspaceNameEditor({ owner }: { owner: WorkspaceType }) {
  const { t } = useLingui();
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
    } else if (!workspaceName.match(/^[a-zA-Z0-9\._\-]+$/)) {
      setWorkspaceNameError(
        t({
          message:
            "Workspace name must only contain letters, numbers, and the characters `._-`",
        })
      );
      valid = false;
    } else {
      setWorkspaceNameError("");
    }
    return valid;
  }, [owner.name, workspaceName, t]);

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
      window.alert(t`Failed to update workspace.`);
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
    <AdminSectionAnchor sectionId={ADMIN_SECTION_IDS.governance.workspaceName}>
      <div className="heading-base text-foreground">
        <Trans>Workspace Name</Trans>
      </div>
      <SettingsList>
        <SettingsList.Row
          title={owner.name}
          action={
            <Button
              variant="outline"
              label={t`Edit`}
              icon={Edit04}
              onClick={() => setIsSheetOpen(true)}
            />
          }
        />
      </SettingsList>
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>
              <Trans>Edit Workspace Name</Trans>
            </SheetTitle>
          </SheetHeader>
          <SheetContainer>
            <div className="mt-6 flex flex-col gap-4">
              <Page.P>
                <Trans>
                  Think GitHub repository names, short and memorable.
                </Trans>
              </Page.P>
              <Input
                name="name"
                placeholder={t`Workspace name`}
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
              label: t`Cancel`,
            }}
            rightButtonProps={{
              onClick: handleUpdateWorkspace,
              variant: "primary",
              label: updating ? t`Saving...` : t`Save`,
              disabled: disable || updating,
            }}
          />
        </SheetContent>
      </Sheet>
    </AdminSectionAnchor>
  );
}
