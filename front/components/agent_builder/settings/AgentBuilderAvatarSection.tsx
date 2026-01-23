import { Avatar, Button, PencilSquareIcon } from "@dust-tt/sparkle";
import { useCallback, useEffect, useRef, useState } from "react";
import { useController, useWatch } from "react-hook-form";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { AgentBuilderFormData } from "@app/components/agent_builder/AgentBuilderFormContext";
import { BLUR_EVENT_NAME } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { AvatarPicker } from "@app/components/agent_builder/settings/avatar_picker/AgentBuilderAvatarPicker";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/agent_builder/settings/avatar_picker/types";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackground,
} from "@app/components/agent_builder/settings/avatar_picker/utils";
import { fetchWithErr } from "@app/components/agent_builder/settings/utils";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  Result,
  WorkspaceType,
} from "@app/types";

const MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS = 20;

async function getEmojiSuggestions({
  owner,
  instructions,
}: {
  owner: WorkspaceType;
  instructions: string;
}): Promise<Result<BuilderEmojiSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "emoji",
      inputs: { instructions },
    }),
  });
}

interface AgentBuilderAvatarSectionProps {
  isCreatingNew: boolean;
}

export function AgentBuilderAvatarSection({
  isCreatingNew,
}: AgentBuilderAvatarSectionProps) {
  const { owner } = useAgentBuilderContext();
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const blurListenerRef = useRef<() => void>();
  const userSetAvatarRef = useRef(false);

  const instructions = useWatch<AgentBuilderFormData, "instructions">({
    name: "instructions",
  });

  const { field } = useController<
    AgentBuilderFormData,
    "agentSettings.pictureUrl"
  >({
    name: "agentSettings.pictureUrl",
  });

  const updateEmojiFromSuggestions = useCallback(async () => {
    let avatarUrl: string | null = null;
    const emojiSuggestions = await getEmojiSuggestions({
      owner,
      instructions: instructions || "",
    });
    if (emojiSuggestions.isOk() && emojiSuggestions.value.suggestions.length) {
      const suggestion = emojiSuggestions.value.suggestions[0];
      const emoji = buildSelectedEmojiType(suggestion.emoji);
      if (emoji) {
        avatarUrl = makeUrlForEmojiAndBackground(
          {
            id: emoji.id,
            unified: emoji.unified,
            native: emoji.native,
          },
          suggestion.backgroundColor as `bg-${string}`
        );
      }
    }

    if (!avatarUrl) {
      const availableUrls = [...DROID_AVATAR_URLS, ...SPIRIT_AVATAR_URLS];
      avatarUrl =
        availableUrls[Math.floor(Math.random() * availableUrls.length)];
    }

    field.onChange(avatarUrl);
  }, [field, instructions, owner]);

  useEffect(() => {
    const onInstructionsBlur = () => {
      if (
        isCreatingNew &&
        !userSetAvatarRef.current &&
        (instructions?.length ?? 0) >= MIN_INSTRUCTIONS_LENGTH_SUGGESTIONS
      ) {
        void updateEmojiFromSuggestions();
      }
    };
    blurListenerRef.current = onInstructionsBlur;
    window.addEventListener(BLUR_EVENT_NAME, onInstructionsBlur);
    return () => {
      if (blurListenerRef.current) {
        window.removeEventListener(BLUR_EVENT_NAME, blurListenerRef.current);
      }
    };
  }, [instructions, updateEmojiFromSuggestions, isCreatingNew]);

  return (
    <>
      <AvatarPicker
        owner={owner}
        isOpen={isAvatarModalOpen}
        setOpen={setIsAvatarModalOpen}
        onPick={(url) => {
          userSetAvatarRef.current = true;
          field.onChange(url);
        }}
        droidAvatarUrls={DROID_AVATAR_URLS}
        spiritAvatarUrls={SPIRIT_AVATAR_URLS}
        avatarUrl={field.value ?? null}
      />
      <div className="group relative">
        <Avatar size="lg" visual={field.value ?? null} />
        <Button
          variant="outline"
          size="sm"
          icon={PencilSquareIcon}
          type="button"
          onClick={() => setIsAvatarModalOpen(true)}
          className="absolute left-1/2 top-1/2 h-10 w-10 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100"
        />
      </div>
    </>
  );
}
