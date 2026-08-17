import {
  useSharePodApp,
  useUnsharePodApp,
  useUpdatePodAppShare,
} from "@app/lib/swr/pods";
import type { PodApp } from "@app/types/api/pod_apps";
import {
  MAX_POD_APP_NAME_LENGTH,
  MAX_POD_APP_SHARE_DESCRIPTION_LENGTH,
} from "@app/types/api/pod_apps";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Chip,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Spinner,
  TextArea,
} from "@dust-tt/sparkle";
import type { ChangeEvent } from "react";
import { useCallback, useState } from "react";

interface SharePodAppDialogProps {
  owner: LightWorkspaceType;
  podId: string;
  app: PodApp;
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Share (or edit the sharing of) a pod app as a workspace toolset: every published function of
 * the app becomes an agent tool, discoverable by name and description.
 */
export function SharePodAppDialog({
  owner,
  podId,
  app,
  isOpen,
  onClose,
}: SharePodAppDialogProps) {
  const appName = app.name ?? app.prefix;
  const isEditing = app.share !== null;

  const [name, setName] = useState(app.share?.toolsetName ?? appName);
  const [description, setDescription] = useState(
    app.share?.description ??
      app.functions.map((fn) => `${fn.name}: ${fn.description}`).join("\n")
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const doShare = useSharePodApp({ owner, podId });
  const doUpdate = useUpdatePodAppShare({ owner, podId });
  const doUnshare = useUnsharePodApp({ owner, podId });

  const trimmedName = name.trim();
  const trimmedDescription = description.trim();
  const canSubmit = trimmedName.length > 0 && trimmedDescription.length > 0;

  const onSubmit = useCallback(async () => {
    setIsSubmitting(true);
    const result = isEditing
      ? await doUpdate(app, {
          name: trimmedName,
          description: trimmedDescription,
        })
      : await doShare(app, {
          name: trimmedName,
          description: trimmedDescription,
        });
    setIsSubmitting(false);
    if (result.isOk()) {
      onClose();
    }
  }, [
    app,
    doShare,
    doUpdate,
    isEditing,
    onClose,
    trimmedDescription,
    trimmedName,
  ]);

  const onStopSharing = useCallback(async () => {
    setIsSubmitting(true);
    const result = await doUnshare(app);
    setIsSubmitting(false);
    if (result.isOk()) {
      onClose();
    }
  }, [app, doUnshare, onClose]);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Sharing of ${appName}` : `Share ${appName} as tools`}
          </DialogTitle>
        </DialogHeader>
        {isSubmitting ? (
          <DialogContainer className="flex flex-col items-center gap-3 py-8">
            <Spinner variant="dark" size="md" />
          </DialogContainer>
        ) : (
          <>
            <DialogContainer className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
                  Toolset name
                </span>
                <Input
                  name="share-toolset-name"
                  value={name}
                  onChange={(e: ChangeEvent<HTMLInputElement>) =>
                    setName(e.target.value)
                  }
                  maxLength={MAX_POD_APP_NAME_LENGTH}
                  containerClassName="w-full"
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
                  Description
                </span>
                <TextArea
                  value={description}
                  onChange={(e: ChangeEvent<HTMLTextAreaElement>) =>
                    setDescription(e.target.value)
                  }
                  maxLength={MAX_POD_APP_SHARE_DESCRIPTION_LENGTH}
                  rows={4}
                />
                <span className="copy-xs text-muted-foreground dark:text-muted-foreground-night">
                  Agents use this description to decide when to use the toolset
                  — make it specific.
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="label-xs uppercase text-muted-foreground dark:text-muted-foreground-night">
                  Functions shared as tools
                </span>
                <div className="flex flex-col gap-1">
                  {app.functions.map((fn) => (
                    <div
                      key={fn.slug}
                      className="flex items-center gap-2 copy-sm"
                    >
                      <span className="font-mono">{fn.name}</span>
                      {fn.userIdentity === "pod_member_required" && (
                        <Chip
                          size="xs"
                          color="warning"
                          label="Pod members only"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <ContentMessage variant="info" title="Workspace-wide tools">
                Agents across the workspace can attach or enable this toolset.
                Functions run on this Pod's Computer, against its databases.
              </ContentMessage>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={
                isEditing
                  ? {
                      label: "Stop sharing",
                      variant: "warning",
                      onClick: () => {
                        void onStopSharing();
                      },
                    }
                  : {
                      label: "Cancel",
                      variant: "outline",
                      onClick: onClose,
                    }
              }
              rightButtonProps={{
                label: isEditing ? "Save" : "Share as tools",
                variant: "primary",
                disabled: !canSubmit,
                onClick: () => {
                  void onSubmit();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
