import {
  ExclamationCircleIcon,
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
import { useRouter } from "next/router";
import { useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useApps } from "@app/lib/swr/apps";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import type { PostAppResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps";
import type { APIError, SpaceType, WorkspaceType } from "@app/types";
import { APP_NAME_REGEXP } from "@app/types";

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
  const router = useRouter();
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
      return "Name must be only contain letters, numbers, and the characters `_-` and be less than 64 characters.";
    }
    if (value.length > 64) {
      return "Name must be less or equal to 64 characters.";
    }
    if (apps.find((app) => app.name === value)) {
      return "An App with this name already exists.";
    }
    return null;
  };

  const onSave = async () => {
    // Validation is already done in onChange handlers and Save button disabled logic
    // Only proceed if all validations pass (button wouldn't be enabled otherwise)
    if (name.trim() && description.trim() && !nameError) {
      const res = await fetch(`/api/w/${owner.sId}/spaces/${space.sId}/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.slice(0, MODELS_STRING_MAX_LENGTH),
          description: description.slice(0, MODELS_STRING_MAX_LENGTH),
        }),
      });
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
          title: "Successfully created app",
          description: "App was successfully created.",
        });
      } else {
        const err: { error: APIError } = await res.json();
        sendNotification({
          title: "Error Saving App",
          type: "error",
          description: `Error: ${err.error.message}`,
        });
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
          <SheetTitle>Create a new App</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <div className="flex flex-col gap-4">
            <div>
              <Page.SectionHeader title="Name" />
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
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <ExclamationCircleIcon /> Must be unique and only use
                alphanumeric, - or _ characters.
              </p>
            </div>
            <Page.Separator />
            <div>
              <Page.SectionHeader title="Description" />
              <TextArea
                placeholder="This description guides agents in understanding how to use
                your app effectively and determines its relevance in responding to user inquiries."
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
            label: "Cancel",
            variant: "outline",
          }}
          rightButtonProps={{
            label: "Save",
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
