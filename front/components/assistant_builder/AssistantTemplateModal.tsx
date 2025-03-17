import {
  Avatar,
  Button,
  Markdown,
  Page,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Spinner,
} from "@dust-tt/sparkle";
import Link from "next/link";

import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import type { WorkspaceType } from "@app/types";

interface AssistantTemplateModalProps {
  flow: BuilderFlow;
  onClose: () => void;
  owner: WorkspaceType;
  templateId: string | null;
}

export function AssistantTemplateModal({
  flow,
  onClose,
  owner,
  templateId,
}: AssistantTemplateModalProps) {
  const { assistantTemplate, isAssistantTemplateLoading } =
    useAssistantTemplate({ templateId });

  return (
    <Sheet
      open={!!templateId}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <SheetContent size="lg">
        {isAssistantTemplateLoading || !assistantTemplate ? (
          <div className="flex h-full items-center justify-center">
            <Spinner variant="color" />
          </div>
        ) : (
          <>
            <SheetHeader>
              <SheetTitle>Template {assistantTemplate.handle}</SheetTitle>
            </SheetHeader>
            <SheetContainer>
              <div className="flex flex-col gap-5">
                <div className="flex max-h-32 max-w-lg flex-row gap-3">
                  <Avatar size="lg" visual={assistantTemplate.pictureUrl} />
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-medium text-foreground dark:text-foreground-night">
                      @{assistantTemplate.handle}
                    </span>
                    <Link
                      href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}&templateId=${assistantTemplate.sId}`}
                    >
                      <Button
                        label="Use this template"
                        variant="primary"
                        data-gtm-label="useTemplateButton"
                        data-gtm-location="templateModal"
                        size="sm"
                      />
                    </Link>
                  </div>
                </div>
                <div>
                  <Markdown content={assistantTemplate.description ?? ""} />
                </div>
                <InstructionsSection
                  instructions={assistantTemplate.presetInstructions}
                />
              </div>
            </SheetContainer>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function InstructionsSection({
  instructions,
}: {
  instructions: string | null;
}) {
  return (
    <>
      <Page.SectionHeader title="Instructions" />
      <ReadOnlyTextArea content={instructions} />
    </>
  );
}
