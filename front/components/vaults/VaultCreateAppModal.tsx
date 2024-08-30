import {
  ExclamationCircleStrokeIcon,
  Input,
  Modal,
  Page,
  RadioButton,
  TextArea,
} from "@dust-tt/sparkle";
import type { APIError, AppVisibility, WorkspaceType } from "@dust-tt/types";
import { useContext, useState } from "react";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { useApps } from "@app/lib/swr";
import { MODELS_STRING_MAX_LENGTH } from "@app/lib/utils";

export const VaultCreateAppModal = ({
  owner,
  isOpen,
  setIsOpen,
}: {
  owner: WorkspaceType;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}) => {
  const sendNotification = useContext(SendNotificationsContext);

  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const [description, setDescription] = useState<string | null>(null);
  const [descriptionError, setDescriptionError] = useState<string | null>(null);

  const [visibility, setVisibility] = useState<AppVisibility>("private");

  const { apps, mutateApps } = useApps(owner);

  const onSave = async () => {
    if (!name || name.trim() === "") {
      setNameError("Name is required.");
    } else if (!name.match(/^[a-zA-Z0-9._-]+$/)) {
      setNameError(
        "App name must only contain letters, numbers, and the characters `._-`"
      );
    } else if (apps.find((app) => app.name === name)) {
      setNameError("An App with this name already exists.");
    }

    if (!description || description.trim() === "") {
      setDescriptionError(
        "A description is required for your app to be selectable in the Assistant Builder."
      );
    }

    if (name && description && !nameError && !descriptionError) {
      const res = await fetch(`/api/w/${owner.sId}/apps`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.slice(0, MODELS_STRING_MAX_LENGTH),
          description: description.slice(0, MODELS_STRING_MAX_LENGTH),
          visibility,
        }),
      });
      if (res.ok) {
        await mutateApps();
        setIsOpen(false);
        // @todo Daph next PR: rework the modal detail so we can propertly redirect
        // on the edition view.
        // const response: PostAppResponseBody = await res.json();
        // const { app } = response;
        // await router.push(`/w/${owner.sId}/a/${app.sId}`);

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
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setIsOpen(false);
      }}
      onSave={async () => {
        await onSave();
      }}
      hasChanged={name !== null || description !== null}
      title="Create a new App"
      variant="side-sm"
    >
      <Page variant="modal">
        <div className="w-full">
          <Page.Vertical sizing="grow">
            <Page.SectionHeader title="Name" />
            <div className="w-full">
              <Input
                placeholder="app_name"
                name="name"
                value={name}
                onChange={(value) => {
                  setName(value);
                  setNameError(null);
                }}
                error={nameError}
                showErrorLabel
              />
              <p className="mt-1 flex items-center gap-1 text-sm text-gray-500">
                <ExclamationCircleStrokeIcon /> Must be unique and not use
                spaces or special characters.
              </p>
            </div>

            <Page.Separator />
            <Page.SectionHeader title="Description" />
            <div className="w-full">
              <TextArea
                placeholder="This description guides assistants in understanding how to use
                your app effectively and determines its relevance in responding to user inquiries."
                value={description}
                onChange={(value) => {
                  setDescription(value);
                  setDescriptionError(null);
                }}
                error={descriptionError}
                showErrorLabel
              />
            </div>
            <Page.Separator />
            <Page.SectionHeader title="Visibility" />
            <RadioButton
              name="visibility"
              className="s-flex-col"
              choices={[
                {
                  label: "Private",
                  value: "private",
                  disabled: false,
                },
                {
                  label: "Public",
                  value: "public",
                  disabled: false,
                },
              ]}
              value={visibility}
              onChange={(v) => {
                setVisibility(v as AppVisibility);
              }}
            />
            <div className="mt-4 space-y-4">
              <p className="text-sm text-gray-500">
                <b>Private: </b> Only builders of your workspace can see and
                edit the app.
              </p>
              <p className="text-sm text-gray-500">
                <b>Public: </b> Anyone on the Internet with the link can see the
                app. Only builders of your workspace can edit.
              </p>
            </div>
          </Page.Vertical>
        </div>
      </Page>
    </Modal>
  );
};
