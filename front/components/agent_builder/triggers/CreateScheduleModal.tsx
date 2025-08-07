import type { MultiPageDialogPage } from "@dust-tt/sparkle";
import {
  Button,
  ClockIcon,
  MultiPageDialog,
  MultiPageDialogContent,
  MultiPageDialogTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useState } from "react";
import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import type { TriggersConfigurationPageId } from "@app/components/agent_builder/types";
import { TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS } from "@app/components/agent_builder/types";
import { useSendNotification } from "@app/hooks/useNotification";

export function CreateScheduleModal() {
  const { owner } = useAgentBuilderContext();
  const sendNotification = useSendNotification();

  const isLoading = false;

  const [isOpen, setIsOpen] = useState(false);
  const [currentPageId, setCurrentPageId] =
    useState<TriggersConfigurationPageId>(
      TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TRIGGER_CONFIG
    );

  const pages: MultiPageDialogPage[] = [
    {
      id: TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TRIGGER_CONFIG,
      title: "Create Schedule",
      description: "",
      icon: undefined,
      content: isLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div>salut</div>
      ),
    },
    {
      id: TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TOOL_CONNECTION,
      title: "Connect required tools",
      description: "",
      icon: undefined,
      content: isLoading ? (
        <div className="flex h-40 w-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div>salut 2</div>
      ),
    },
  ];

  const handleCancel = () => {
    setIsOpen(false);
  };

  const handleBackToConfig = () => {
    setCurrentPageId(TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TRIGGER_CONFIG);
  };

  const handleConfigurationSave = async () => {
    sendNotification({
      title: "Configuration failed",
      description: "Not implemented.",
      type: "error",
    });
  };

  const getFooterButtons = () => {
    const isConfigurationPage =
      currentPageId === TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TRIGGER_CONFIG;
    const isConnectionPage =
      currentPageId === TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TOOL_CONNECTION;

    if (isConfigurationPage) {
      return {
        leftButton: {
          label: "Cancel",
          variant: "outline" as const,
          onClick: handleCancel,
        },
        rightButton: {
          label: "Add Trigger",
          variant: "primary",
          disabled: false,
          onClick: async () => {
            setCurrentPageId(
              TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TOOL_CONNECTION
            );
          },
        },
      };
    }

    if (isConnectionPage) {
      return {
        leftButton: {
          label: "Back",
          variant: "outline",
          onClick: handleBackToConfig,
        },
        centerButton: {
          label: "Cancel",
          variant: "outline",
          onClick: handleCancel,
        },
        rightButton: {
          label: "Save Configuration",
          variant: "primary",
          onClick: handleConfigurationSave,
        },
      };
    }

    return {};
  };

  const { leftButton, centerButton, rightButton } = getFooterButtons();

  return (
    <MultiPageDialog
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) {
          setCurrentPageId(
            TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TRIGGER_CONFIG
          );
        }
      }}
    >
      <MultiPageDialogTrigger asChild>
        <Button label="Schedule" variant="ghost" icon={ClockIcon} />
      </MultiPageDialogTrigger>
      <MultiPageDialogContent
        showNavigation={false}
        size="lg"
        pages={pages}
        currentPageId={currentPageId}
        onPageChange={(pageId) => {
          if (
            pageId === TRIGGERS_CONFIGURATION_DIALOG_PAGE_IDS.TOOL_CONNECTION
          ) {
            handleBackToConfig();
          } else {
            setCurrentPageId(pageId as TriggersConfigurationPageId);
          }
        }}
        leftButton={leftButton}
        centerButton={centerButton}
        rightButton={rightButton}
      />
    </MultiPageDialog>
  );
}
