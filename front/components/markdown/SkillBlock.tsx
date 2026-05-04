import { getSkillIcon } from "@app/lib/skill";
import { Chip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

interface SkillBlockProps {
  skillIcon?: string | null;
  skillName: string;
}

export function SkillBlock({ skillIcon, skillName }: SkillBlockProps) {
  return (
    <Chip
      label={skillName}
      icon={getSkillIcon(skillIcon ?? null)}
      color="white"
      size="xs"
    />
  );
}

export function skillDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "skill" && node.children[0]) {
        const data = node.data ?? {};
        // `unist-util-visit` directive transforms are expected to annotate the
        // current node in place so mdast-util-to-hast can consume `node.data`.
        node.data = data;
        data.hName = "skill";
        data.hProperties = {
          skillId: node.attributes.sId,
          skillIcon: node.attributes.icon,
          skillName: node.children[0].value,
        };
      }
    });
  };
}
