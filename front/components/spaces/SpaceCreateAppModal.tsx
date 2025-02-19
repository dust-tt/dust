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
  useSendNotification,
} from "@dust-tt/sparkle";
import type { APIError, SpaceType, WorkspaceType } from "@dust-tt/types";
import { APP_NAME_REGEXP } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useState } from "react";

import { useApps } from "@app/lib/swr/apps";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";
import type { PostAppResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/apps";

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

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);

  const [errors, setErrors] = useState<{
    name: string | null;
    description: string | null;
  }>({
    name: null,
    description: null,
  });

  const { apps, mutateApps } = useApps({ owner, space });

  const onSave = async () => {
    let nameError: string | null = null;
    let descriptionError: string | null = null;

    if (!name || name.trim() === "") {
      nameError = "Name is required.";
    } else if (!name.match(APP_NAME_REGEXP)) {
      nameError =
        "Name must be only contain letters, numbers, and the characters `_-` and be less than 64 characters.";
    } else if (name.length > 64) {
      nameError = "Name must be less or equal to 64 characters.";
    } else if (apps.find((app) => app.name === name)) {
      nameError = "An App with this name already exists.";
    }

    if (!description || description.trim() === "") {
      descriptionError =
        "A description is required for your app to be selectable in the Agent Builder.";
    }

    setErrors({
      name: nameError,
      description: descriptionError,
    });

    if (name && description && !nameError && !descriptionError) {
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
                  setName(e.target.value);
                  if (errors.name) {
                    setErrors({ ...errors, name: null });
                  }
                }}
                message={errors.name}
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
                value={description ?? ""}
                onChange={(e) => {
                  setDescription(e.target.value);
                  if (errors.description) {
                    setErrors({ ...errors, description: null });
                  }
                }}
                error={errors.description}
                showErrorLabel
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
            disabled: !(name !== null || description !== null),
          }}
        />
      </SheetContent>
    </Sheet>
  );
};
