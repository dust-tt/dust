import { buildAgentInstructionsReadOnlyExtensions } from "@app/components/agent_builder/instructions/AgentBuilderInstructionsEditor";
import { preprocessMarkdownForEditor } from "@app/components/editor/lib/preprocessMarkdownForEditor";
import { useWorkspace } from "@app/lib/auth/AuthContext";
import { useRequiredPathParam } from "@app/lib/platform";
import { usePokeAgentDetails } from "@app/poke/swr/agent_details";
import { Spinner } from "@dust-tt/sparkle";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect, useMemo, useRef } from "react";

export function AssistantInstructionsPage() {
  const owner = useWorkspace();
  const aId = useRequiredPathParam("aId");

  const {
    data: agentDetails,
    isLoading,
    isError,
  } = usePokeAgentDetails({
    owner,
    aId,
    disabled: false,
  });

  const agentConfig = agentDetails?.agentConfigurations[0];
  const instructions = agentConfig?.instructions ?? "";
  const instructionsHtml = agentConfig?.instructionsHtml ?? null;

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
        // Prefer HTML content if available (preserves block IDs).
        // Fall back to markdown for agents without stored HTML.
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

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (isError || !agentDetails) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p>Error loading agent details.</p>
      </div>
    );
  }

  const agentName = agentConfig?.name ?? "Unknown";

  return (
    <div>
      <h3 className="mb-4 text-xl font-bold">Instructions for @{agentName}</h3>
      <div className="overflow-auto rounded-xl border border-border p-2 dark:border-border-night">
        <EditorContent editor={editor} className="leading-7" />
      </div>
    </div>
  );
}
