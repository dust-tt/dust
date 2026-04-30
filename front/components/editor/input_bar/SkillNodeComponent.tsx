import { getSkillIcon } from "@app/lib/skill";
import { Chip } from "@dust-tt/sparkle";
import { NodeViewWrapper } from "@tiptap/react";
// biome-ignore lint/correctness/noUnusedImports: React is required by JSX runtime in this file.
import React from "react";

interface SkillNodeComponentProps {
  node: {
    attrs: {
      skillId?: string;
      skillName?: string;
    };
  };
}

export function SkillNodeComponent({ node }: SkillNodeComponentProps) {
  const skillName = node.attrs.skillName ?? "Skill";

  return (
    <NodeViewWrapper className="inline-flex align-middle">
      <Chip
        label={skillName}
        icon={getSkillIcon(null)}
        color="white"
        size="xs"
      />
    </NodeViewWrapper>
  );
}
