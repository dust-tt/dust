import {
  Avatar,
  Button,
  ElementModal,
  Markdown,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import Link from "next/link";

import { ReadOnlyTextArea } from "@app/components/assistant/ReadOnlyTextArea";
import type { BuilderFlow } from "@app/components/assistant_builder/types";
import { useAssistantTemplate } from "@app/lib/swr/assistants";
import { useUser } from "@app/lib/swr/user";

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
  const { user } = useUser();
  const { assistantTemplate, isAssistantTemplateLoading } =
    useAssistantTemplate({
      templateId,
      workspaceId: owner.sId,
    });

  if (!templateId) {
    return null;
  }

  if (isAssistantTemplateLoading || !assistantTemplate) {
    return <Spinner variant="color" />;
  }

  const { description, handle, pictureUrl, presetInstructions, sId } =
    assistantTemplate;

  return (
    <ElementModal
      title=""
      openOnElement={templateId}
      onClose={onClose}
      hasChanged={false}
      variant="side-md"
    >
      <Page variant="modal">
        <div className="flex flex-col gap-5 pb-6">
          <div className="flex max-h-32 max-w-lg flex-row gap-3">
            <Avatar size="lg" visual={pictureUrl} />
            <div className="flex flex-col gap-1">
              <span className="text-lg font-medium text-foreground">
                @{handle}
              </span>
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}&templateId=${sId}`}
              >
                <Button
                  label="Use this template"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    window.gtag("event", "useTemplateButtonClicked", {
                      event_category: "assistantBuilder",
                      event_label: "templateModal",
                      template_id: sId,
                      template_handle: handle,
                      user_id: user?.sId,
                      workspace_id: owner.sId,
                      flow: flow,
                    });
                  }}
                />
              </Link>
            </div>
          </div>
          <div>
            <Markdown content={description ?? ""} />
          </div>
          <InstructionsSection instructions={presetInstructions} />
        </div>
      </Page>
    </ElementModal>
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
