import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { useApps } from "@app/lib/swr/apps";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import type { PostAppResponseBody } from "@app/types/api/apps";
import { APP_NAME_REGEXP } from "@app/types/app";
import type { SpaceType } from "@app/types/space";
import type { WorkspaceType } from "@app/types/user";
import {
  AlertCircle,
  Input,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  TextArea,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";

interface SpaceCreateAppModalProps {
  isOpen: boolean;
  owner: WorkspaceType;
  setIsOpen: (isOpen: boolean) => void;
  space: SpaceType;
}

export const SpaceCreateAppModal = ({
  isOpen,
  owner,
  setIsOpen,
  space,
}: SpaceCreateAppModalProps) => {
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const router = useAppRouter();
  const sendNotification = useSendNotification();

  const [name, setName] = useState<string>("");
  const [description, setDescription] = useState<string>("");

  const [nameError, setNameError] = useState<string | null>(null);

  const { apps, mutateApps } = useApps({ owner, space });

  const validateName = (value: string): string | null => {
    if (value.trim() === "") {
      return null; // No error when empty
    }
    if (!value.match(APP_NAME_REGEXP)) {
      return t`Name must be only contain letters, numbers, and the characters \`_-\` and be less than 64 characters.`;
    }
    if (value.length > 64) {
      return t`Name must be less or equal to 64 characters.`;
    }
    if (apps.find((app) => app.name === value)) {
      return t`An app with this name already exists.`;
    }
    return null;
  };

  const onSave = async () => {
    // Validation is already done in onChange handlers and Save button disabled logic
    // Only proceed if all validations pass (button wouldn't be enabled otherwise)
    if (name.trim() && description.trim() && !nameError) {
      const res = await clientFetch(
        `/api/w/${owner.sId}/spaces/${space.sId}/apps`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: name.slice(0, MODELS_STRING_MAX_LENGTH),
            description: description.slice(0, MODELS_STRING_MAX_LENGTH),
          }),
        }
      );
      if (res.ok) {
        await mutateApps();
        const response: PostAppResponseBody = await res.json();
        const { app } = response;
        await router.push(
          `/w/${owner.sId}/spaces/${app.space.sId}/apps/${app.sId}`
        );
        setIsOpen(false);

        sendNotification({
          type: "success",
          title: t`Successfully created app`,
          description: t`App was successfully created.`,
        });
      } else {
        const err: unknown = await res.json();
        sendApiErrorNotification({ title: t`Error saving app`, error: err });
      }
    }
  };

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          setIsOpen(false);
        }
      }}
    >
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle>
            <Trans>Create a new app</Trans>
          </SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <div>
              <Page.SectionHeader title={t`Name`} />
              <Input
                placeholder="app_name"
                name="name"
                value={name}
                onChange={(e) => {
                  const value = e.target.value;
                  setName(value);
                  setNameError(validateName(value));
                }}
                message={nameError}
                messageStatus="error"
              />
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
                <AlertCircle />
                <Trans>
                  Must be unique and only use alphanumeric, - or _ characters.
                </Trans>
              </p>
            </div>
            <Page.Separator />
            <div>
              <Page.SectionHeader title={t`Description`} />
              <TextArea
                placeholder={t`This description guides agents in understanding how to use your app effectively and determines its relevance in responding to user inquiries.`}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                }}
              />
            </div>
          </div>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: t`Cancel`,
            variant: "outline",
          }}
          rightButtonProps={{
            label: t`Save`,
            onClick: onSave,
            disabled:
              name.trim() === "" ||
              description.trim() === "" ||
              nameError !== null,
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
