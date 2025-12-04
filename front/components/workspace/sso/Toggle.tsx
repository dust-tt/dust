import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";
import React from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress";
import type { WorkspaceType } from "@app/types";

export function ToggleEnforceEnterpriseConnectionModal({
  isOpen,
  onClose,
  owner,
}: {
  isOpen: boolean;
  onClose: (updated: boolean) => void;
  owner: WorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const titleAndContent = {
    enforce: {
      title: "Enable Single Sign On Enforcement",
      content: `
          By enforcing SSO, access through social media logins will be discontinued.
          Instead, you'll be directed to sign in via the SSO portal.
          Please note, this change will require all users to sign out and reconnect using SSO.
        `,
      validateLabel: "Enforce Single Sign On",
    },
    remove: {
      title: "Disable Single Sign On Enforcement",
      content: `By disabling SSO enforcement, users will have the flexibility to login with social media.`,
      validateLabel: "Disable Single Sign-On Enforcement",
    },
  };

  const handleToggleSsoEnforced = React.useCallback(
    async (ssoEnforced: boolean) => {
      const res = await clientFetch(`/api/w/${owner.sId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ssoEnforced,
        }),
      });

      if (!res.ok) {
        sendNotification({
          type: "error",
          title: "Update failed",
          description: `Failed to enforce sso on workspace.`,
        });
      } else {
        onClose(true);
      }
    },
    [owner, sendNotification, onClose]
  );

  const dialog = titleAndContent[owner.ssoEnforced ? "remove" : "enforce"];

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialog.title}</DialogTitle>
        </DialogHeader>
        <DialogContainer>{dialog.content}</DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onClose(false),
          }}
          rightButtonProps={{
            label: dialog.validateLabel,
            variant: "warning",
            onClick: async () => {
              await handleToggleSsoEnforced(!owner.ssoEnforced);
            },
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
