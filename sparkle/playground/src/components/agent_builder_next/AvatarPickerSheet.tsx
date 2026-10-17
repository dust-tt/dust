import {
  Avatar,
  Button,
  ColorPicker,
  EmojiPicker,
  FaceSmile,
  Image01,
  Popover,
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
  Upload01,
} from "@dust-tt/sparkle";
import { useEffect, useState } from "react";

import { AVATAR_COLORS, DROID_AVATARS, SPIRIT_AVATARS } from "./data";

export type AgentScope = "visible" | "hidden";
export type AgentAvatar = { emoji: string; backgroundColor: string };

/** The avatar picker: droid and spirit galleries, an emoji + color tab, upload. */
export function AvatarPickerSheet({
  open,
  onOpenChange,
  avatar,
  name,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  avatar: AgentAvatar;
  name: string;
  onSave: (avatar: AgentAvatar) => void;
}) {
  const [draft, setDraft] = useState<AgentAvatar>(avatar);
  const [isSaving, setIsSaving] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const isDirty =
    draft.emoji !== avatar.emoji ||
    draft.backgroundColor !== avatar.backgroundColor;

  useEffect(() => {
    if (open) {
      setDraft(avatar);
      setUploaded(false);
    }
  }, [open, avatar]);

  const pickAndClose = (emoji: string) => {
    onSave({ ...draft, emoji });
    onOpenChange(false);
  };

  const gallery = (emojis: string[]) => (
    <div className="grid grid-cols-8 gap-3 pt-4">
      {emojis.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={`Use ${emoji} as avatar`}
          className="flex items-center justify-center rounded-2xl p-1 transition-colors hover:bg-muted-background focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
          onClick={() => pickAndClose(emoji)}
        >
          <Avatar
            size="md"
            emoji={emoji}
            backgroundColor={draft.backgroundColor}
          />
        </button>
      ))}
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="lg" side="right">
        <SheetHeader hideButton>
          <SheetTitle className="sr-only">Pick an avatar for {name}</SheetTitle>
        </SheetHeader>
        <SheetContainer>
          <Tabs defaultValue="emojis">
            <TabsList>
              <TabsTrigger value="droids" label="Droids" icon={Image01} />
              <TabsTrigger value="spirits" label="Spirits" icon={Image01} />
              <TabsTrigger value="emojis" label="Emojis" icon={FaceSmile} />
              <TabsTrigger value="upload" label="Upload" icon={Upload01} />
            </TabsList>
            <TabsContent value="droids">{gallery(DROID_AVATARS)}</TabsContent>
            <TabsContent value="spirits">{gallery(SPIRIT_AVATARS)}</TabsContent>
            <TabsContent value="emojis">
              <div className="flex flex-col items-center gap-6 pt-6">
                <Avatar
                  size="2xl"
                  emoji={draft.emoji}
                  backgroundColor={draft.backgroundColor}
                />
                <div className="flex items-center gap-2">
                  <Popover
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        label="Pick an Emoji"
                      />
                    }
                    content={
                      <EmojiPicker
                        theme="light"
                        onEmojiSelect={(emoji) =>
                          setDraft((prev) => ({ ...prev, emoji: emoji.native }))
                        }
                      />
                    }
                  />
                  <Popover
                    trigger={
                      <Button
                        size="sm"
                        variant="outline"
                        label="Pick a color"
                      />
                    }
                    content={
                      <ColorPicker
                        colors={AVATAR_COLORS}
                        selectedColor={draft.backgroundColor}
                        onColorSelect={(color) =>
                          setDraft((prev) => ({
                            ...prev,
                            backgroundColor: color,
                          }))
                        }
                      />
                    }
                  />
                </div>
              </div>
            </TabsContent>
            <TabsContent value="upload">
              <div className="flex flex-col items-center gap-4 pt-6">
                <Button
                  size="sm"
                  variant="outline"
                  icon={Upload01}
                  label="Upload"
                  onClick={() => {
                    setUploaded(true);
                    setDraft((prev) => ({ ...prev, emoji: "🖼️" }));
                  }}
                />
                {uploaded ? (
                  <div className="flex h-64 w-64 items-center justify-center rounded-2xl border border-dashed border-border bg-muted-background text-sm text-muted-foreground">
                    Drag to crop
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: () => onOpenChange(false),
          }}
          rightButtonProps={{
            label: isSaving ? "Saving…" : "Save",
            variant: "primary",
            disabled: !isDirty || isSaving,
            onClick: () => {
              setIsSaving(true);
              window.setTimeout(() => {
                setIsSaving(false);
                onSave(draft);
                onOpenChange(false);
              }, 400);
            },
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
