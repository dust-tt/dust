import {
  ArrowUpOnSquareIcon,
  Avatar,
  EmotionLaughIcon,
  ImageIcon,
  Modal,
  Tab,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { useMemo, useRef, useState } from "react";
import React from "react";

import AssistantBuilderCustomUpload from "@app/components/assistant_builder/avatar_picker/AssistantBuilderCustomUpload";
import AssistantBuilderEmojiPicker from "@app/components/assistant_builder/avatar_picker/AssistantBuilderEmojiPicker";
import type { AvatarPickerTabElement } from "@app/components/assistant_builder/avatar_picker/types";

type TabId = "droids" | "spirits" | "emojis" | "upload";

interface TabConfig {
  label: string;
  id: TabId;
  current: boolean;
  icon: React.ComponentType<{
    className?: string;
  }>;
}

export function AvatarPicker({
  avatarUrl,
  owner,
  isOpen,
  setOpen,
  onPick,
  droidAvatarUrls,
  spiritAvatarUrls,
}: {
  avatarUrl: string | null;
  owner: WorkspaceType;
  isOpen: boolean;
  setOpen: (isOpen: boolean) => void;
  onPick: (avatar: string) => void;
  droidAvatarUrls: string[];
  spiritAvatarUrls: string[];
}) {
  const [currentTab, setCurrentTab] = useState<TabId>("droids");

  const [isStale, setIsStale] = useState(false);

  const avatarUrls: Record<TabId, string[]> = {
    droids: droidAvatarUrls,
    spirits: spiritAvatarUrls,
    upload: [],
  };
  const tabs: TabConfig[] = useMemo(
    () => [
      {
        label: "Droids",
        id: "droids",
        current: currentTab === "droids",
        icon: ImageIcon,
      },
      {
        label: "Spirits",
        id: "spirits",
        current: currentTab === "spirits",
        icon: ImageIcon,
      },
      {
        label: "Emojis",
        id: "emojis",
        current: currentTab === "emojis",
        icon: EmotionLaughIcon,
      },
      {
        label: "Upload",
        id: "upload",
        current: currentTab === "upload",
        icon: ArrowUpOnSquareIcon,
      },
    ],
    [currentTab]
  );

  const onClose = () => {
    setOpen(false);

    // wait for modal close animation to finish before resetting state
    setTimeout(() => {
      // setCrop(DEFAULT_CROP);
      setCurrentTab("droids");
      // setSrc(null);
    }, 300);
  };

  const parentRef = useRef<AvatarPickerTabElement>(null);

  const handleSave = async (
    currentTab: TabId,
    parentRef: React.RefObject<AvatarPickerTabElement>
  ) => {
    // TODO: Use `currentTab`.
    if (isStale && parentRef.current) {
      const imageUrl = await parentRef.current.getUrl();

      console.log(">> imageUrl:", imageUrl);

      onPick(imageUrl);
    }

    setIsStale(false);

    onClose();
  };

  // TODO: Move outside of main component.
  const renderTabContent = (currentTab: TabId) => {
    switch (currentTab) {
      case "emojis":
        return (
          <AssistantBuilderEmojiPicker
            ref={parentRef}
            onChange={() => {
              setIsStale(true);
            }}
            avatarUrl={avatarUrl}
          />
        );

      case "droids":
      case "spirits":
        return (
          <div className="mb-16 mt-3 grid w-full grid-cols-8 gap-2 overflow-y-auto">
            {avatarUrls[currentTab].map((url) => (
              <div
                key={url}
                className="cursor-pointer"
                onClick={() => {
                  onPick(url);
                  onClose();
                }}
              >
                <Avatar size="auto" visual={url} />
              </div>
            ))}
          </div>
        );

      case "upload":
        return (
          <AssistantBuilderCustomUpload
            ref={parentRef}
            owner={owner}
            onChange={() => setIsStale(true)}
          />
        );
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title=""
      variant="side-md"
      hasChanged={isStale}
      onSave={async () => handleSave(currentTab, parentRef)}
    >
      <div className="h-full w-full overflow-visible">
        <Tab
          tabs={tabs}
          setCurrentTab={(tab) => {
            setCurrentTab(tab);
            setIsStale(false);
          }}
          className="pt-3"
        />
        <div className="h-full w-full overflow-y-auto">
          {renderTabContent(currentTab)}
        </div>
      </div>
    </Modal>
  );
}
