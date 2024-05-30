import {
  ArrowUpIcon,
  AttachmentIcon,
  Button,
  EyeIcon,
  FullscreenExitIcon,
  FullscreenIcon,
  IconButton,
} from "@dust-tt/sparkle";
import type {
  AgentMention,
  LightAgentConfigurationType,
  WorkspaceType,
} from "@dust-tt/types";
import { EditorContent } from "@tiptap/react";
import React, { useContext, useEffect, useRef, useState } from "react";

import { AssistantPicker } from "@app/components/assistant/AssistantPicker";
import useAssistantSuggestions from "@app/components/assistant/conversation/input_bar/editor/useAssistantSuggestions";
import type { CustomEditorProps } from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useCustomEditor from "@app/components/assistant/conversation/input_bar/editor/useCustomEditor";
import useHandleMentions from "@app/components/assistant/conversation/input_bar/editor/useHandleMentions";
import { InputBarContext } from "@app/components/assistant/conversation/input_bar/InputBarContext";
import { classNames } from "@app/lib/utils";

const ScreenshotButton = () => {
  const [screenshotSrc, setScreenshotSrc] = useState("");

  const takeScreenshot = async () => {
    try {
      const displayMediaOptions = {
        video: {
          displaySurface: "browser",
        },
        preferCurrentTab: false,
        selfBrowserSurface: "exclude",
        systemAudio: "include",
        surfaceSwitching: "include",
        monitorTypeSurfaces: "include",
      };

      const stream = await navigator.mediaDevices.getDisplayMedia(
        displayMediaOptions
      );
      const video = document.createElement("video");
      video.srcObject = stream;

      video.onloadedmetadata = async () => {
        console.log(">> onloadedmetadata <<");
        await video.play();
        // Create a canvas to capture the screenshot
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the screenshot URL
        const screenshotUrl = canvas.toDataURL("image/png");
        console.log(screenshotUrl); // Example: log the screenshot URL

        setScreenshotSrc(screenshotUrl);

        // Stop the stream
        stream.getTracks().forEach((track) => track.stop());
      };
    } catch (error) {
      console.error("Error taking screenshot:", error);
    }
  };

  console.log(">> screenshotSrc:", screenshotSrc);
  return (
    <div>
      {screenshotSrc ? <img src={screenshotSrc} /> : <></>}
      <button onClick={takeScreenshot}>Take Screenshot</button>
    </div>
  );
};

async function captureScreen(): Promise<string | null> {
  try {
    const displayMediaOptions = {
      video: {
        displaySurface: "browser",
      },
      preferCurrentTab: false,
      selfBrowserSurface: "exclude",
      systemAudio: "include",
      surfaceSwitching: "include",
      monitorTypeSurfaces: "include",
    };

    const stream = await navigator.mediaDevices.getDisplayMedia(
      displayMediaOptions
    );
    const video = document.createElement("video");
    video.srcObject = stream;

    return await new Promise((resolve, reject) => {
      video.onloadedmetadata = async () => {
        console.log(">> onloadedmetadata <<");
        await video.play();

        // Create a canvas to capture the screenshot
        const originalWidth = video.videoWidth;
        const originalHeight = video.videoHeight;

        // Calculate the scaling factor
        // const maxDimension = 512;
        // Apply a 50% ratio.
        const maxDimension = Math.max(originalHeight, originalWidth) / 2;
        let newWidth = originalWidth;
        let newHeight = originalHeight;

        if (originalWidth > originalHeight && originalWidth > maxDimension) {
          newWidth = maxDimension;
          newHeight = (originalHeight * maxDimension) / originalWidth;
        } else if (
          originalHeight > originalWidth &&
          originalHeight > maxDimension
        ) {
          newHeight = maxDimension;
          newWidth = (originalWidth * maxDimension) / originalHeight;
        } else if (
          originalWidth === originalHeight &&
          originalWidth > maxDimension
        ) {
          newWidth = maxDimension;
          newHeight = maxDimension;
        }

        console.log(
          `Rescaling screenshot from (${originalWidth}px*${originalHeight}px) to (${newWidth}px*${newHeight}px)`
        );

        // Create a canvas to capture the screenshot.
        const canvas = document.createElement("canvas");

        canvas.width = newWidth;
        canvas.height = newHeight;

        // canvas.width = video.videoWidth;
        // canvas.height = video.videoHeight;
        const context = canvas.getContext("2d");
        context?.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get the screenshot URL.
        const screenshotUrl = canvas.toDataURL("image/png");

        console.log(">> screenshotUrl:", screenshotUrl);

        // Stop the stream.
        stream.getTracks().forEach((track) => track.stop());

        return resolve(screenshotUrl);
      };

      video.onerror = (error) => {
        stream.getTracks().forEach((track) => track.stop());
        reject(error);
      };
    });
  } catch (error) {
    console.error("Error taking screenshot:", error);
    return Promise.reject(error);
  }
}

export interface InputBarContainerProps {
  allAssistants: LightAgentConfigurationType[];
  agentConfigurations: LightAgentConfigurationType[];
  onEnterKeyDown: CustomEditorProps["onEnterKeyDown"];
  onInputFileChange: (e: React.ChangeEvent) => Promise<void>;
  owner: WorkspaceType;
  selectedAssistant: AgentMention | null;
  stickyMentions: AgentMention[] | undefined;
  hideQuickActions: boolean;
  disableAutoFocus: boolean;
  disableSendButton: boolean;
}

const InputBarContainer = ({
  allAssistants,
  agentConfigurations,
  onEnterKeyDown,
  onInputFileChange,
  owner,
  selectedAssistant,
  stickyMentions,
  hideQuickActions,
  disableAutoFocus,
  disableSendButton,
}: InputBarContainerProps) => {
  const suggestions = useAssistantSuggestions(agentConfigurations, owner);

  const [isExpanded, setIsExpanded] = useState(false);
  function handleExpansionToggle() {
    setIsExpanded((currentExpanded) => !currentExpanded);

    // Focus at the end of the document when toggling expansion.
    editorService.focusEnd();
  }

  function resetEditorContainerSize() {
    setIsExpanded(false);
  }

  const { editor, editorService } = useCustomEditor({
    suggestions,
    onEnterKeyDown,
    resetEditorContainerSize,
    disableAutoFocus,
  });

  // When input bar animation is requested it means the new button was clicked (removing focus from
  // the input bar), we grab it back.
  const { animate } = useContext(InputBarContext);
  useEffect(() => {
    if (animate) {
      editorService.focusEnd();
    }
  }, [animate, editorService]);

  useHandleMentions(
    editorService,
    agentConfigurations,
    stickyMentions,
    selectedAssistant,
    disableAutoFocus
  );

  // TODO: Reset after loading.
  const fileInputRef = useRef<HTMLInputElement>(null);

  const contentEditableClasses = classNames(
    "inline-block w-full",
    "border-0 pr-1 pl-2 sm:pl-0 outline-none ring-0 focus:border-0 focus:outline-none focus:ring-0 py-3.5",
    "whitespace-pre-wrap font-normal"
  );

  return (
    <div
      id="InputBarContainer"
      className="relative flex flex-1 flex-col sm:flex-row"
    >
      <EditorContent
        editor={editor}
        className={classNames(
          contentEditableClasses,
          "scrollbar-hide",
          "overflow-y-auto",
          isExpanded
            ? "h-[60vh] max-h-[60vh] lg:h-[80vh] lg:max-h-[80vh]"
            : "max-h-64"
        )}
      />

      <div className="flex flex-row items-end justify-between gap-2 self-stretch py-2 pr-2 sm:flex-col sm:border-0">
        <div className="flex gap-5 rounded-full border border-structure-200/60 px-4 py-2 sm:gap-3 sm:px-2">
          <input
            accept=".txt,.pdf,.md,.csv,image/*"
            onChange={async (e) => {
              await onInputFileChange(e);
              editorService.focusEnd();
            }}
            ref={fileInputRef}
            style={{ display: "none" }}
            type="file"
            multiple={true}
          />
          <IconButton
            variant={"tertiary"}
            icon={AttachmentIcon}
            size="sm"
            tooltip="Add a document to the conversation (only .txt, .pdf, .md, .csv)."
            tooltipPosition="above"
            className="flex"
            onClick={() => {
              fileInputRef.current?.click();
            }}
          />
          <IconButton
            variant={"tertiary"}
            icon={EyeIcon}
            size="sm"
            tooltip="Add a document to the conversation (only .txt, .pdf, .md, .csv)."
            tooltipPosition="above"
            className="flex"
            onClick={async () => {
              const screenshotUrl = await captureScreen();

              console.log(">> got url:", screenshotUrl);

              if (!screenshotUrl) {
                // TODO: Notification!
                return;
              }

              const blob = await (await fetch(screenshotUrl)).blob(); // Convert data URL to blob
              const file = new File([blob], "screenshot.png", {
                type: "image/png",
              });

              const event = {
                target: {
                  files: [file],
                },
              };

              console.log(">> file:", file);
              // event?.target as HTMLInputElement)?.files

              await onInputFileChange(event);
              // fileInputRef.current?.click();
            }}
          />
          {!hideQuickActions && (
            <>
              <AssistantPicker
                owner={owner}
                size="sm"
                onItemClick={(c) => {
                  editorService.insertMention({ id: c.sId, label: c.name });
                }}
                assistants={allAssistants}
                showFooterButtons={true}
              />
              <div className="hidden sm:flex">
                <IconButton
                  variant={"tertiary"}
                  icon={isExpanded ? FullscreenExitIcon : FullscreenIcon}
                  size="sm"
                  className="flex"
                  onClick={handleExpansionToggle}
                />
              </div>
            </>
          )}
        </div>
        <Button
          size="sm"
          icon={ArrowUpIcon}
          label="Send"
          disabled={editorService.isEmpty() || disableSendButton}
          labelVisible={false}
          disabledTooltip
          onClick={async () => {
            const jsonContent = editorService.getTextAndMentions();
            onEnterKeyDown(editorService.isEmpty(), jsonContent, () => {
              editorService.clearEditor();
              resetEditorContainerSize();
            });
          }}
        />
      </div>
    </div>
  );
};

export default InputBarContainer;
