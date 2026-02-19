import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { AgentMessageMarkdown } from "@app/components/assistant/AgentMessageMarkdown";
import { AssistantKnowledgeSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantKnowledgeSection";
import { AssistantSkillsToolsSection } from "@app/components/assistant/details/tabs/AgentInfoTab/AssistantSkillsToolsSection";
import { preprocessMarkdownForEditor } from "@app/components/editor/lib/preprocessMarkdownForEditor";
import { getModelProviderLogo } from "@app/components/providers/types";
import { useTheme } from "@app/components/sparkle/ThemeContext";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types/assistant/models/models";
import type { WorkspaceType } from "@app/types/user";
import { Avatar, Chip, cn, Markdown, Page } from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";

export function AgentInfoTab({
  agentConfiguration,
  owner,
}: {
  agentConfiguration: AgentConfigurationType;
  owner: WorkspaceType;
}) {
  const { isDark } = useTheme();
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

  const model = SUPPORTED_MODEL_CONFIGS.find(
    (m) =>
      m.modelId === agentConfiguration.model.modelId &&
      m.providerId === agentConfiguration.model.providerId
  );

  return (
    <div className="flex flex-col gap-5">
      {agentConfiguration.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {agentConfiguration.tags.map((tag) => (
            <Chip key={tag.sId} color="golden" label={tag.name} size="xs" />
          ))}
        </div>
      )}

      {agentConfiguration.description && (
        <div className="text-sm text-foreground dark:text-foreground-night">
          <Markdown
            content={agentConfiguration.description}
            forcedTextSize="text-sm"
          />
        </div>
      )}

      {displayInstructions && (
        <div className="dd-privacy-mask flex flex-col gap-4">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Instructions
          </div>
          <div
            className={cn(
              "max-h-[400px] overflow-y-auto rounded-lg border border-border bg-muted-background px-3 py-2 " +
                "dark:border-border-night dark:bg-muted-background-night"
            )}
          >
            {instructionsHtml !== null || instructions.length === 0 ? (
              <ReadOnlyInstructionsEditor
                instructions={instructions}
                instructionsHtml={instructionsHtml}
              />
            ) : (
              <AgentMessageMarkdown
                content={instructions}
                owner={owner}
                compactSpacing={true}
                isInstructions={true}
              />
            )}
          </div>
        </div>
      )}

      <AssistantSkillsToolsSection
        agentConfiguration={agentConfiguration}
        owner={owner}
        isDustAgent={isDustAgent}
      />

      {displayKnowledge && (
        <>
          <Page.Separator />
          <AssistantKnowledgeSection
            agentConfiguration={agentConfiguration}
            owner={owner}
          />
        </>
      )}

      {model && (
        <div className="flex flex-col gap-5">
          <div className="heading-lg text-foreground dark:text-foreground-night">
            Model
          </div>
          <div className="flex flex-row items-center gap-2">
            <Avatar
              icon={getModelProviderLogo(model.providerId, isDark)}
              size="xs"
            />
            <div>{model.displayName}</div>
          </div>
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
