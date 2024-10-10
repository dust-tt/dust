import {
  Avatar,
  Button,
  IconButton,
  Input,
  Page,
  PencilSquareIcon,
  SparklesIcon,
  Spinner,
} from "@dust-tt/sparkle";
import type {
  APIError,
  BuilderEmojiSuggestionsType,
  BuilderSuggestionsType,
  Result,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { AvatarPicker } from "@app/components/assistant_builder/avatar_picker/AssistantBuilderAvatarPicker";
import {
  buildSelectedEmojiType,
  makeUrlForEmojiAndBackgroud,
} from "@app/components/assistant_builder/avatar_picker/utils";
import {
  DROID_AVATAR_URLS,
  SPIRIT_AVATAR_URLS,
} from "@app/components/assistant_builder/shared";
import type { AssistantBuilderState } from "@app/components/assistant_builder/types";
import { ConfirmContext } from "@app/components/Confirm";
import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import { debounce } from "@app/lib/utils/debounce";

export function removeLeadingAt(handle: string) {
  return handle.startsWith("@") ? handle.slice(1) : handle;
}

function assistantHandleIsValid(handle: string) {
  return /^[a-zA-Z0-9_-]{1,30}$/.test(removeLeadingAt(handle));
}

async function assistantHandleIsAvailable({
  owner,
  handle,
  initialHandle,
  checkUsernameTimeout,
}: {
  owner: WorkspaceType;
  handle: string;
  initialHandle: string | undefined;
  checkUsernameTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
}) {
  if (checkUsernameTimeout.current) {
    clearTimeout(checkUsernameTimeout.current);
  }
  // No check needed if the assistant doesn't change name
  if (handle === initialHandle) {
    return Promise.resolve(true);
  }
  return new Promise((resolve, reject) => {
    checkUsernameTimeout.current = setTimeout(async () => {
      checkUsernameTimeout.current = null;
      const res = await fetch(
        `/api/w/${
          owner.sId
        }/assistant/agent_configurations/name_available?handle=${encodeURIComponent(
          handle
        )}`
      );
      if (!res.ok) {
        return reject(
          new Error("An error occurred while checking the handle.")
        );
      }
      const { available } = await res.json();
      return resolve(available);
    }, 500);
  });
}

export async function validateHandle({
  owner,
  handle,
  initialHandle,
  checkUsernameTimeout,
}: {
  owner: WorkspaceType;
  handle: string | null;
  initialHandle: string | undefined;
  checkUsernameTimeout: React.MutableRefObject<NodeJS.Timeout | null>;
}): Promise<{
  handleValid: boolean;
  handleErrorMessage: string | null;
}> {
  let errorMessage: string | null = null;

  if (!handle || handle === "@") {
    errorMessage = "The name cannot be empty";
  } else {
    if (!assistantHandleIsValid(handle)) {
      if (handle.length > 30) {
        errorMessage = "The name must be 30 characters or less";
      } else {
        errorMessage = "Only letters, numbers, _ and - allowed";
      }
    } else if (
      !(await assistantHandleIsAvailable({
        owner,
        handle,
        initialHandle,
        checkUsernameTimeout,
      }))
    ) {
      errorMessage = "This name is already taken";
    }
  }

  return {
    handleValid: !errorMessage,
    handleErrorMessage: errorMessage,
  };
}

export default function NamingScreen({
  owner,
  builderState,
  initialHandle,
  setBuilderState,
  setEdited,
  assistantHandleError,
  descriptionError,
}: {
  owner: WorkspaceType;
  builderState: AssistantBuilderState;
  initialHandle: string | undefined;
  setBuilderState: (
    stateFn: (state: AssistantBuilderState) => AssistantBuilderState
  ) => void;
  setEdited: (edited: boolean) => void;
  assistantHandleError: string | null;
  descriptionError: string | null;
}) {
  const confirm = useContext(ConfirmContext);
  const sendNotification = useContext(SendNotificationsContext);
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);

  // Name suggestions handling
  const [nameSuggestions, setNameSuggestions] =
    useState<BuilderSuggestionsType>({
      status: "unavailable",
      reason: "irrelevant",
    });
  const nameDebounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);

  const checkUsernameTimeout = useRef<NodeJS.Timeout | null>(null);
  const updateNameSuggestions = useCallback(async () => {
    const nameSuggestions = await getNamingSuggestions({
      owner,
      instructions: builderState.instructions || "",
      description: builderState.description || "",
    });
    if (nameSuggestions.isOk()) {
      setNameSuggestions(nameSuggestions.value);
    }
  }, [owner, builderState.instructions, builderState.description]);

  const updateEmojiFromSuggestions = useCallback(async () => {
    let avatarUrl: string | null = null;
    const emojiSuggestions = await getEmojiSuggestions({
      owner,
      instructions: builderState.instructions || "",
    });
    if (emojiSuggestions.isOk() && emojiSuggestions.value.suggestions.length) {
      const suggestion = emojiSuggestions.value.suggestions[0];
      const emoji = buildSelectedEmojiType(suggestion.emoji);
      if (emoji) {
        avatarUrl = makeUrlForEmojiAndBackgroud(
          {
            id: emoji.id,
            unified: emoji.unified,
            native: emoji.native,
          },
          suggestion.backgroundColor as `bg-${string}`
        );
      }
      // Default on Ed's babies if no emoji is found
      if (!avatarUrl) {
        const availableUrls = [...DROID_AVATAR_URLS, ...SPIRIT_AVATAR_URLS];
        avatarUrl =
          availableUrls[Math.floor(Math.random() * availableUrls.length)];
      }

      setBuilderState((state) => ({
        ...state,
        avatarUrl,
      }));
    }
  }, [owner, builderState.instructions, setBuilderState]);

  useEffect(() => {
    debounce(nameDebounceHandle, updateNameSuggestions);
  }, [
    builderState.description,
    builderState.instructions,
    owner,
    updateNameSuggestions,
  ]);

  // Emoji suggestion handling

  useEffect(() => {
    if (!builderState.avatarUrl) {
      void updateEmojiFromSuggestions();
    }
  }, [builderState.avatarUrl, updateEmojiFromSuggestions]);

  // Description suggestions handling

  const [generatingDescription, setGeneratingDescription] = useState(false);
  const [descriptionIsGenerated, setDescriptionIsGenerated] = useState(false);
  const suggestDescription = useCallback(
    async (fromUserClick?: boolean) => {
      setGeneratingDescription(true);
      const notifyError = fromUserClick ? sendNotification : console.log;
      const descriptionSuggestions = await getDescriptionSuggestions({
        owner,
        instructions: builderState.instructions || "",
        name: builderState.handle || "",
      });
      if (descriptionSuggestions.isOk()) {
        const suggestion =
          descriptionSuggestions.value.status === "ok" &&
          descriptionSuggestions.value.suggestions?.length
            ? descriptionSuggestions.value.suggestions[0]
            : null;
        if (suggestion) {
          setBuilderState((state) => ({
            ...state,
            description: suggestion,
          }));
          setDescriptionIsGenerated(true);
        } else {
          const errorMessage =
            descriptionSuggestions.value.status === "unavailable"
              ? descriptionSuggestions.value.reason ||
                "No suggestions available"
              : "No suggestions available";
          notifyError({
            type: "error",
            title: "Error generating description suggestion.",
            description: errorMessage,
          });
        }
      } else {
        notifyError({
          type: "error",
          title: "Error generating description suggestion.",
          description: descriptionSuggestions.error.message,
        });
      }
      setGeneratingDescription(false);
    },
    [
      owner,
      builderState.instructions,
      builderState.handle,
      setBuilderState,
      sendNotification,
    ]
  );

  useEffect(() => {
    if (
      !builderState.description?.trim() &&
      builderState.instructions?.trim() &&
      !generatingDescription
    ) {
      void suggestDescription();
    }
    // Here we only want to run this effect once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        avatarUrl={builderState.avatarUrl}
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
            {nameSuggestions.status === "ok" &&
              nameSuggestions.suggestions?.length && (
                <div className="flex items-center gap-2">
                  <div className="text-xs font-semibold text-element-800">
                    Suggestions:
                  </div>
                  {nameSuggestions.suggestions
                    .slice(0, 3)
                    .filter(async () =>
                      validateHandle({
                        owner,
                        handle: builderState.handle,
                        initialHandle,
                        checkUsernameTimeout,
                      })
                    )
                    .map((suggestion, index) => (
                      <Button
                        label={`@${suggestion.replace(/\s/g, "")}`}
                        variant="secondary"
                        key={`naming-suggestion-${index}`}
                        size="xs"
                        onClick={() => {
                          setEdited(true);
                          setBuilderState((state) => ({
                            ...state,
                            // remove all whitespaces from suggestion
                            handle: suggestion.replace(/\s/g, ""),
                          }));
                        }}
                      />
                    ))}
                </div>
              )}

            <div>
              <Input
                placeholder="SalesAssistant, FrenchTranslator, SupportCenter…"
                value={builderState.handle}
                onChange={(e) => {
                  setEdited(true);
                  setBuilderState((state) => ({
                    ...state,
                    handle: e.target.value.trim(),
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
            <Avatar size="xl" visual={builderState.avatarUrl} />
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
            <div className="flex gap-1">
              <Page.SectionHeader title="Description" />
            </div>
            <div className="text-sm font-normal text-element-700">
              Describe for others the assistant’s purpose.{" "}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-grow">
              <Input
                placeholder={
                  generatingDescription
                    ? "Generating description..."
                    : "Click on sparkles to generate a description"
                }
                value={generatingDescription ? "" : builderState.description}
                onChange={(e) => {
                  setEdited(true);
                  setDescriptionIsGenerated(false);
                  setBuilderState((state) => ({
                    ...state,
                    description: e.target.value,
                  }));
                }}
                name="assistantDescription"
                error={descriptionError}
                className="text-sm"
                disabled={generatingDescription}
              />
            </div>
            {generatingDescription ? (
              <Spinner size="sm" />
            ) : (
              <IconButton
                icon={SparklesIcon}
                size="md"
                disabled={generatingDescription}
                onClick={async () => {
                  if (
                    !builderState.description?.trim() ||
                    descriptionIsGenerated ||
                    (await confirm({
                      title: "Double checking",
                      message:
                        "Heads up! This will overwrite your current description. Are you sure you want to proceed?",
                    }))
                  ) {
                    await suggestDescription();
                  }
                }}
                tooltip="Click to generate a description"
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

async function getNamingSuggestions({
  owner,
  instructions,
  description,
}: {
  owner: WorkspaceType;
  instructions: string;
  description: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "name",
      inputs: { instructions, description },
    }),
  });
}

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

async function getDescriptionSuggestions({
  owner,
  instructions,
  name,
}: {
  owner: WorkspaceType;
  instructions: string;
  name: string;
}): Promise<Result<BuilderSuggestionsType, APIError>> {
  return fetchWithErr(`/api/w/${owner.sId}/assistant/builder/suggestions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "description",
      inputs: { instructions, name },
    }),
  });
}

async function fetchWithErr<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Result<T, APIError>> {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      return new Err({
        type: "internal_server_error",
        message: `Failed to fetch: ${
          res.statusText
        }\nResponse: ${await res.text()}`,
      });
    }

    return new Ok((await res.json()) as T);
  } catch (e) {
    return new Err({
      type: "internal_server_error",
      message: `Failed to fetch.\nError: ${e}`,
    });
  }
}
