import { getSkillIcon } from "@app/lib/skill";
import { Chip } from "@dust-tt/sparkle";
// biome-ignore lint/correctness/noUnusedImports: ignored using `--suppress`
import React from "react";
import { visit } from "unist-util-visit";

export function SkillBlock({ skillName }: { skillName: string }) {
  return (
    <Chip label={skillName} icon={getSkillIcon(null)} color="white" size="xs" />
  );
}

export function skillDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "skill" && node.children[0]) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = "skill";
        data.hProperties = {
          skillId: node.attributes.sId,
          skillName: node.children[0].value,
        };
      }
    });
  };
}
