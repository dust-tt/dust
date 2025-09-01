import {
  Button,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DocumentIcon,
  MagicIcon,
} from "@dust-tt/sparkle";
import { useRouter } from "next/router";
import React, { useState } from "react";

import type { BuilderFlow } from "@app/components/agent_builder/types";
import type { TemplateTagsType, WorkspaceType } from "@app/types";

type CreationMode = "templates" | "ai_generation";

interface AgentCreationDialogProps {
  children?: React.ReactNode;
  owner: WorkspaceType;
  flow: BuilderFlow;
  templateTagsMapping: TemplateTagsType;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AgentCreationDialog({
  children,
  owner,
  flow,
  templateTagsMapping,
  isOpen: controlledIsOpen,
  onOpenChange: controlledOnOpenChange,
}: AgentCreationDialogProps) {
  const router = useRouter();
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const [mode, setMode] = useState<CreationMode>("templates");
  const [aiInstructions, setAiInstructions] = useState("");

  const isOpen = controlledIsOpen !== undefined ? controlledIsOpen : internalIsOpen;
  const setIsOpen = controlledOnOpenChange || setInternalIsOpen;

  const handleStartFromScratch = async () => {
    setIsOpen(false);
    await router.push(`/w/${owner.sId}/builder/agents/new`);
  };

  const handleGenerateWithAI = async () => {
    if (!aiInstructions.trim()) return;

    setIsOpen(false);
    await router.push(
      `/w/${owner.sId}/builder/agents/new?aiInstructions=${encodeURIComponent(
        aiInstructions.trim()
      )}`
    );
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setMode("templates");
      setAiInstructions("");
    }
  };

  const dialogContent = (
    <>
      <DialogHeader>
        <DialogTitle>Create an agent</DialogTitle>
        {mode !== "ai_generation" && (
          <DialogDescription>
            Choose how you'd like to get started
          </DialogDescription>
        )}
      </DialogHeader>
      <DialogContainer>
        <div className={`flex flex-col gap-6 ${mode !== "ai_generation" ? "py-4" : ""}`}>
          {mode !== "ai_generation" && (
            <div className="flex flex-row justify-center gap-4">
              <button
                onClick={() => setMode("ai_generation")}
                className="flex h-14 max-w-xs flex-1 items-center justify-center gap-3 rounded-xl s-bg-highlight s-text-highlight-50 hover:s-bg-highlight-light active:s-bg-highlight-dark text-base font-medium transition-colors"
              >
                <MagicIcon className="h-5 w-5" />
                <span>Generate with AI</span>
              </button>
              <button
                onClick={handleStartFromScratch}
                className="flex h-14 max-w-xs flex-1 items-center justify-center gap-3 rounded-xl border border-border bg-background text-base font-medium text-foreground transition-colors hover:bg-muted hover:border-muted-foreground/20"
              >
                <DocumentIcon className="h-5 w-5" />
                <span>Start from scratch</span>
              </button>
            </div>
          )}

          {mode === "ai_generation" && (
            <div className="flex flex-col gap-3">
              <div className="relative flex w-full flex-col rounded-2xl border border-border-dark/50 bg-muted-background transition-all duration-300 focus-within:border-border-dark focus-within:ring-2 focus-within:ring-highlight/30 dark:border-border-dark-night dark:bg-muted-background-night dark:focus-within:border-border-dark-night dark:focus-within:ring-2 dark:focus-within:ring-highlight/30-night">
                <textarea
                  value={aiInstructions}
                  onChange={(e) => {
                    setAiInstructions(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 240)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && aiInstructions.trim()) {
                      e.preventDefault();
                      handleGenerateWithAI();
                    }
                  }}
                  placeholder="Describe what you want your agent to do..."
                  className="min-h-[96px] max-h-64 w-full resize-none overflow-y-auto bg-transparent px-4 py-4 text-base leading-6 outline-none placeholder:text-gray-400"
                  style={{ height: "96px" }}
                  autoFocus
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => {
                    if (aiInstructions.trim()) {
                      handleGenerateWithAI();
                    }
                  }}
                  className="s-inline-flex s-items-center s-justify-center s-gap-2 s-rounded-xl s-h-10 s-px-4 s-py-2 s-text-sm s-font-medium s-whitespace-nowrap s-ring-inset s-ring-offset-background s-transition-colors s-bg-highlight s-text-highlight-50 hover:s-bg-highlight-light active:s-bg-highlight-dark focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0 dark:focus-visible:s-ring-0 dark:focus-visible:s-ring-offset-1"
                >
                  <MagicIcon className="s-h-4 s-w-4" />
                  <span>Generate Agent</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </DialogContainer>
    </>
  );

  if (controlledIsOpen !== undefined) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleOpenChange(false);
          } else if (controlledOnOpenChange) {
            controlledOnOpenChange(true);
          }
        }}
      >
        <DialogContent size="lg">{dialogContent}</DialogContent>
      </Dialog>
    );
  }

  return (
    <>
      <Dialog
        open={internalIsOpen}
        onOpenChange={(open) => {
          setInternalIsOpen(open);
          if (!open) {
            setMode("templates");
            setAiInstructions("");
          }
        }}
      >
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent size="lg">{dialogContent}</DialogContent>
      </Dialog>
    </>
  );
}

