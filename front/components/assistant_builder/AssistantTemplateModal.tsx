import { Avatar, Button, Modal, Page, Spinner2 } from "@dust-tt/sparkle";
import type { WorkspaceType } from "@dust-tt/types";
import Link from "next/link";

import type { BuilderFlow } from "@app/components/assistant_builder/AssistantBuilder";
import { useAssistantTemplate } from "@app/lib/swr";

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
    useAssistantTemplate({
      templateId,
      workspaceId: owner.sId,
    });

  if (!templateId) {
    return null;
  }

  if (isAssistantTemplateLoading || !assistantTemplate) {
    return <Spinner2 variant="color" />;
  }

  return (
    <Modal
      title=""
      isOpen={templateId !== null}
      onClose={onClose}
      hasChanged={false}
      variant="side-sm"
    >
      <Page variant="modal">
        <div className="flex flex-col gap-5 pb-6">
          <div className="flex max-h-32 max-w-lg flex-row gap-3">
            <Avatar
              emoji={assistantTemplate.emoji ?? "🫶"}
              size="lg"
              isRounded
              backgroundColor={
                assistantTemplate.backgroundColor ?? "bg-red-100"
              }
            />
            <div className="flex flex-col gap-1">
              <span className="text-bold text-lg font-medium text-element-900">
                {assistantTemplate.name}
              </span>
              <Link
                href={`/w/${owner.sId}/builder/assistants/new?flow=${flow}&templateId=${assistantTemplate.sId}`}
              >
                <Button label="Use this template" variant="primary" size="sm" />
              </Link>
            </div>
          </div>
          <p className="text-sm font-normal text-element-900">
            {assistantTemplate.description}
          </p>
          <Page.SectionHeader title="Instructions" />
          {/* // TODO: Should we truncate after X lines? */}
          <p className="whitespace-pre-line text-sm font-normal text-element-700">
            {assistantTemplate.presetInstructions}
          </p>
          <Page.SectionHeader title="Data Sources" />
          <p className="whitespace-pre-line text-sm font-normal text-element-700">
            {assistantTemplate.helpActions}
          </p>
        </div>
      </Page>
    </Modal>
  );
}
