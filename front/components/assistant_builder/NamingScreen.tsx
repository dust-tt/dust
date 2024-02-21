import { AvatarPicker } from "@app/components/assistant_builder/AssistantBuilderAvatarPicker";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { Avatar, Input, Button, PencilSquareIcon } from "@dust-tt/sparkle";
import { WorkspaceType } from "@dust-tt/types";
import { useState } from "react";

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
    statefn: (state: AssistantBuilderState) => AssistantBuilderState
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

      <div className="flex w-full flex-col gap-4">
        <div className="text-2xl font-bold text-element-900">Identity</div>
        <div className="flex flex-row items-start gap-8">
          <div className="flex flex-col gap-4">
            <div className="text-lg font-bold text-element-900">Name</div>
            <div className="flex-grow self-stretch text-sm font-normal text-element-700">
              Choose a name reflecting the expertise, knowledge access or
              function of your&nbsp;assistant. Mentioning the&nbsp;assistant in
              a conversation, like <span className="italic">"@help"</span> will
              prompt a&nbsp;response from&nbsp;them.
            </div>
            <div className="text-sm">
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
            <div className="text-lg font-bold text-element-900">
              Description
            </div>
            <div className="flex-grow self-stretch text-sm font-normal text-element-700">
              Add a short description that will help Dust and other workspace
              members understand the&nbsp;assistant’s&nbsp;purpose.
            </div>
            <div className="text-sm">
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
      </div>
    </>
  );
}
