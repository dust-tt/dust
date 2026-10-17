import {
  BarFooter,
  BarHeader,
  Button,
  Chip,
  Folder,
  Planet,
  Plus,
  ScrollArea,
  TextArea,
} from "@dust-tt/sparkle";
import React, { useState } from "react";

import { KnowledgeComposer } from "./KnowledgeComposer";
import { SKILL_BUILDER_SLASH_COMMANDS } from "./SlashMenuPanel";

// A playground stand-in for front/components/skill_builder/SkillBuilder.tsx.
// The real one is wired to react-hook-form, SWR and the workspace context, so
// this reproduces its chrome and section order with static content instead —
// enough to judge the "/" menu inside a real page rather than centred on an
// empty screen. Headings and helper copy are copied from the production
// sections verbatim.
function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col items-start justify-between gap-2 sm:flex-row">
        <div className="space-y-1">
          <h3 className="heading-lg font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function SkillBuilderView() {
  // The composer owns the insert action; the header button just calls it.
  const [insertKnowledge, setInsertKnowledge] = useState<(() => void) | null>(
    null
  );

  return (
    <div className="flex h-dvh flex-row bg-background text-foreground">
      <div className="flex h-full w-full flex-col">
        <BarHeader
          variant="default"
          className="mx-4"
          title="Create new skill"
          rightActions={
            <div className="flex items-center gap-2">
              <BarHeader.ButtonBar variant="close" />
            </div>
          }
        />

        <ScrollArea className="flex-1">
          <div className="mx-auto space-y-10 p-8 2xl:max-w-5xl">
            <Section
              title="When to use this skill"
              description="Tell the agent when it should use this skill."
            >
              <TextArea
                minRows={4}
                resize="vertical"
                placeholder="Describe when the agent should reach for this skill…"
                defaultValue="Use this skill when someone asks for a weekly summary of what the team shipped, or wants the highlights from a set of documents."
              />
            </Section>

            {/* The section under test: production's instructions editor
                swapped for the knowledge composer. The CTA lives on the
                title line, which is where production keeps its own
                "Attach knowledge" button — the composer hands the action up
                the same way SkillBuilderInstructionsSection gets it. */}
            <Section
              title="Instructions"
              description='Provide the guidelines the skill should follow when it runs. Type "/" to insert knowledge, tools, or another skill.'
              action={
                <Button
                  size="sm"
                  variant="outline"
                  label="Insert"
                  icon={Plus}
                  // Must not steal focus from the textarea, or the caret the
                  // "/" is inserted at is lost.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={insertKnowledge ?? undefined}
                  disabled={!insertKnowledge}
                />
              }
            >
              <KnowledgeComposer
                className="max-w-none"
                commands={SKILL_BUILDER_SLASH_COMMANDS}
                placeholder="What does this skill do?"
                onAddKnowledge={(insert) => setInsertKnowledge(() => insert)}
              />
            </Section>

            <Section
              title="Spaces and Pods"
              description="Choose which spaces and Pods this skill can access. The skill can use their knowledge and capabilities, and only users with access to all selected spaces and Pods can use it."
              action={<Button label="Manage" icon={Planet} variant="outline" />}
            >
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" label="Company Data" icon={Planet} />
                <Chip size="sm" label="Engineering" icon={Planet} />
              </div>
            </Section>

            <Section
              title="Files"
              description="Add files that will be available to the skill at runtime. Templates, schemas, scripts, or reference materials."
              action={
                <Button label="Add files" icon={Plus} variant="outline" />
              }
            >
              <div className="flex flex-wrap gap-2">
                <Chip size="sm" label="weekly-template.md" icon={Folder} />
              </div>
            </Section>

            <Section title="Skill settings">
              <p className="text-sm text-muted-foreground">
                Editors, visibility and defaults live here in the real builder.
              </p>
            </Section>
          </div>
        </ScrollArea>

        <BarFooter
          variant="default"
          className="mx-4 justify-between"
          leftActions={<Button variant="outline" label="Cancel" />}
          rightActions={<Button variant="highlight" label="Save" />}
        />
      </div>
    </div>
  );
}
