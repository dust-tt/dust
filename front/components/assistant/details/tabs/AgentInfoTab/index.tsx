import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import {
  DetailsSectionHeading,
  EditedSectionBar,
} from "@app/components/assistant/details/DetailsSectionHeading";
import {
  useAgentSuggestionPreview,
  useEditedAgentSections,
} from "@app/components/assistant/details/SuggestionPreviewContext";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantKnowledgeSection";
import { AssistantSkillsToolsSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantSkillsToolsSection";
import { RedactedAgentMessage } from "@app/components/assistant/details/tabs/AgentInfoTab/RedactedAgentMessage";
import { EditorContent } from "@app/components/editor/EditorContent";
import { preprocessMarkdownForEditor } from "@app/components/editor/lib/preprocessMarkdownForEditor";
import { getModelProviderLogo } from "@app/components/providers/types";
import { RequestedSpacesSection } from "@app/components/spaces/RequestedSpacesSection";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { PreviewedAgentCapabilities } from "@app/lib/editor/preview_agent_suggestions";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import { formatResponseFormat } from "@app/types/assistant/models/utils";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, Chip, CodeBlock, cn, Markdown, Page } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";

export function AgentInfoTab({
  agentConfiguration,
  previewedCapabilities,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  previewedCapabilities: PreviewedAgentCapabilities | null;
  owner: WorkspaceType;
}) {
  const { t } = useLingui();
  const { isDark } = useTheme();
  const editedSections = useEditedAgentSections();
  const previewSuggestions = useAgentSuggestionPreview();
  const isDustAgent =
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST ||
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DEEP_DIVE ||
    agentConfiguration.sId === GLOBAL_AGENTS_SID.DUST_EDGE;

  const isGlobalAgent = agentConfiguration.scope === "global";
  const displayKnowledge = !isGlobalAgent || isDustAgent;

  const instructions = agentConfiguration.instructions ?? "";
  const instructionsHtml = agentConfiguration.instructionsHtml ?? null;
  const displayInstructions =
    !isGlobalAgent && (instructionsHtml !== null || instructions.length > 0);

  // The API redacts the private fields (instructions, skills, knowledge) of the agents an admin
  // cannot read, and flags it with `canViewContent: false`. Only admins ever get such a response.
  const isRedactedForAdmin = agentConfiguration.canViewContent === false;

  const { responseFormat } = agentConfiguration.model;
  const displayStructuredOutput =
    !isRedactedForAdmin &&
    (!!responseFormat || editedSections.has("structured_output"));

  const model = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === agentConfiguration.model.modelId &&
      m.providerId === agentConfiguration.model.providerId
  );

  return (
    <div className="flex flex-col gap-5">
      {(agentConfiguration.tags.length > 0 || editedSections.has("tags")) && (
        <div className="relative flex flex-wrap gap-2">
          {editedSections.has("tags") && <EditedSectionBar />}
          {agentConfiguration.tags.length > 0 ? (
            agentConfiguration.tags.map((tag) => (
              <Chip key={tag.sId} color="info" label={tag.name} size="xs" />
            ))
          ) : (
            <span className="text-sm text-muted-foreground">
              <Trans>No tags</Trans>
            </span>
          )}
        </div>
      )}

      {agentConfiguration.description && (
        <div className="relative text-sm text-foreground">
          {editedSections.has("description") && <EditedSectionBar />}
          <Markdown
            content={agentConfiguration.description}
            forcedTextSize="text-sm"
          />
        </div>
      )}

      {isRedactedForAdmin && (
        <RedactedAgentMessage
          agentConfiguration={agentConfiguration}
          owner={owner}
        />
      )}

      {displayInstructions && (
        <div className="dd-privacy-mask flex flex-col gap-4">
          <DetailsSectionHeading
            label={t`Instructions`}
            isEdited={editedSections.has("instructions")}
          />
          <div
            className={cn(
              "max-h-[400px] overflow-y-auto rounded-lg border border-border bg-muted-background px-3 py-2"
            )}
          >
            {/* Remounts the instructions editor on preview change, since it only reads its content once. */}
            <ReadOnlyInstructionsEditor
              key={previewSuggestions.map((s) => s.sId).join(",")}
              instructions={instructions}
              instructionsHtml={instructionsHtml}
            />
          </div>
        </div>
      )}

      {!isRedactedForAdmin && (
        <AssistantSkillsToolsSection
          agentConfiguration={agentConfiguration}
          previewedCapabilities={previewedCapabilities}
          owner={owner}
          isDustAgent={isDustAgent}
        />
      )}

      {displayKnowledge && !isRedactedForAdmin && (
        <>
          <Page.Separator />
          <AssistantKnowledgeSection
            agentConfiguration={agentConfiguration}
            owner={owner}
          />
        </>
      )}

      {/* An admin may view an agent requesting spaces they are not a member of. */}
      <RequestedSpacesSection
        owner={owner}
        requestedSpaceIds={agentConfiguration.requestedSpaceIds}
        resolveAsAdmin={!agentConfiguration.canRead}
      />

      {model && (
        <div className="relative flex flex-col gap-5">
          {editedSections.has("model") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>Model</Trans>
          </div>
          <div className="flex flex-row items-center gap-2">
            <Avatar
              icon={getModelProviderLogo(model.providerId, isDark)}
              size="xs"
            />
            <div className="whitespace-nowrap mr-2">{model.displayName}</div>
            <div className="text-sm text-muted-foreground">
              {model.description}
            </div>
          </div>
        </div>
      )}

      {displayStructuredOutput && (
        <div className="relative flex flex-col gap-3">
          {editedSections.has("structured_output") && <EditedSectionBar />}
          <div className="heading-lg text-foreground">
            <Trans>Structured output</Trans>
          </div>
          {responseFormat ? (
            <CodeBlock className="language-json" wrapLongLines>
              {formatResponseFormat(responseFormat)}
            </CodeBlock>
          ) : (
            <span className="text-sm text-muted-foreground">
              <Trans>No structured output</Trans>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

interface ReadOnlyInstructionsEditorProps {
  instructions: string;
  instructionsHtml: string | null;
}

function ReadOnlyInstructionsEditor({
  instructions,
  instructionsHtml,
}: ReadOnlyInstructionsEditorProps) {
  const extensions = useMemo(
    () => buildAgentInstructionsReadOnlyExtensions(),
    []
  );

  const initialContentSetRef = useRef(false);

  const editor = useEditor(
    {
      extensions,
      editable: false,
      immediatelyRender: false,
    },
    [extensions]
  );

  useEffect(() => {
    if (
      !editor ||
      editor.isDestroyed ||
      initialContentSetRef.current ||
      (!instructions && !instructionsHtml)
    ) {
      return;
    }

    initialContentSetRef.current = true;

    requestAnimationFrame(() => {
      if (editor && !editor.isDestroyed) {
        if (instructionsHtml) {
          editor.commands.setContent(instructionsHtml, {
            emitUpdate: false,
          });
        } else if (instructions) {
          editor.commands.setContent(
            preprocessMarkdownForEditor(instructions),
            {
              emitUpdate: false,
              contentType: "markdown",
            }
          );
        }
      }
    });
  }, [editor, instructions, instructionsHtml]);

  return <EditorContent editor={editor} />;
}
