import {
  Avatar,
  Button,
  Input,
  Page,
  PencilSquareIcon,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

import { AvatarPicker } from "@app/components/assistant_builder/AssistantBuilderAvatarPicker";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";

export default function NamingScreen({
  owner,
  builderState,
  setBuilderState,
  setEdited,
  assistantHandleError,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  assistantHandleError: string | null;
}) {
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  return (
    <>
      <AvatarPicker
        owner={owner}
        isOpen={isAvatarModalOpen}
        setOpen={setIsAvatarModalOpen}
        onPick={(avatarUrl) => {
          setEdited(true);
          setBuilderState((state) => ({
            ...state,
            avatarUrl,
          }));
        }}
        droidAvatarUrls={DROID_AVATAR_URLS}
        spiritAvatarUrls={SPIRIT_AVATAR_URLS}
      />

      <div className="flex w-full flex-col gap-5">
        <Page.Header title="Naming" />
        <div className="flex gap-8">
          <div className="flex flex-grow flex-col gap-4">
            <div>
              <Page.SectionHeader title="Handle" />
              <div className="text-sm font-normal text-element-700">
                Handles are used to mention (call) an assistant. They must be
                descriptive and unique.
              </div>
            </div>
            <div>
              <Input
                placeholder="SalesAssistant, FrenchTranslator, SupportCenter…"
                value={builderState.handle}
                onChange={(value) => {
                  setEdited(true);
                  setBuilderState((state) => ({
                    ...state,
                    handle: value.trim(),
                  }));
                }}
                error={assistantHandleError}
                name="assistantName"
                showErrorLabel
                className="text-sm"
              />
            </div>
          </div>
          <div className="flex flex-col items-center space-y-2">
            <Avatar
              size="xl"
              visual={<img src={builderState.avatarUrl || ""} />}
            />
            <Button
              labelVisible={true}
              label={"Change"}
              variant="tertiary"
              size="xs"
              icon={PencilSquareIcon}
              onClick={() => {
                setIsAvatarModalOpen(true);
              }}
            />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <div>
            <Page.SectionHeader title="Description" />
            <div className="text-sm font-normal text-element-700">
              Describe for others the assistant’s purpose.
            </div>
          </div>
          <div>
            <Input
              placeholder="Answer questions about sales, translate from English to French…"
              value={builderState.description}
              onChange={(value) => {
                setEdited(true);
                setBuilderState((state) => ({
                  ...state,
                  description: value,
                }));
              }}
              error={null} // TODO ?
              name="assistantDescription"
              className="text-sm"
            />
          </div>
        </div>
      </div>
    </>
  );
}
