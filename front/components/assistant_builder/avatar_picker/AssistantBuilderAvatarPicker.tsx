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

type AvatarUrlTabId = "droids" | "spirits";
type TabId = AvatarUrlTabId | "emojis" | "upload";

const DEFAULT_TAB: TabId = "emojis";

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
  const [currentTab, setCurrentTab] = useState<TabId>(DEFAULT_TAB);
  const [isStale, setIsStale] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const avatarUrls: Record<AvatarUrlTabId, string[]> = {
    droids: droidAvatarUrls,
    spirits: spiritAvatarUrls,
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

    // Wait for modal close animation to finish before resetting state.
    setTimeout(() => {
      setIsStale(false);
      setCurrentTab(DEFAULT_TAB);
    }, 300);
  };

  const parentRef = useRef<AvatarPickerTabElement>(null);

  const handleSave = async (
    parentRef: React.RefObject<AvatarPickerTabElement>
  ) => {
    if (isStale && parentRef.current) {
      setIsSaving(true);
      const imageUrl = await parentRef.current.getUrl();

      if (imageUrl) {
        onPick(imageUrl);
      }
    }
    setIsSaving(false);
    onClose();
  };

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
      onSave={async () => handleSave(parentRef)}
      isSaving={isSaving}
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
