import {
  ArrowUpOnSquareIcon,
  Avatar,
  EmotionLaughIcon,
  ImageIcon,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import React, { useMemo, useRef, useState } from "react";

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
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        <VisuallyHidden>
          <SheetHeader>
            <SheetTitle></SheetTitle>
          </SheetHeader>
        </VisuallyHidden>
        <SheetContainer>
          <Tabs
            value={currentTab}
            onValueChange={(tab) => {
              setCurrentTab(tab as TabId);
              setIsStale(false);
            }}
          >
            <TabsList className="flex h-10 flex-grow items-center gap-2">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  label={tab.label}
                  icon={tab.icon}
                />
              ))}
            </TabsList>
            <div className="h-full w-full overflow-y-auto">
              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id}>
                  {renderTabContent(tab.id)}
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: isSaving ? "Saving..." : "Save",
            onClick: () => handleSave(parentRef),
            disabled: !isStale || isSaving,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
