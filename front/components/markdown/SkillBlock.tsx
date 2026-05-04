import { getSkillIcon } from "@app/lib/skill";
import { getManageSkillsRoute } from "@app/lib/utils/router";
import type { WorkspaceType } from "@app/types/user";
import { isBuilder } from "@app/types/user";
import { Chip } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

export interface SkillDirectiveProps {
  skillId: string;
  skillIcon?: string | null;
  skillName: string;
}

interface SkillBlockProps extends SkillDirectiveProps {
  owner: WorkspaceType;
}

export function SkillBlock({
  owner,
  skillId,
  skillIcon,
  skillName,
}: SkillBlockProps) {
  const href = isBuilder(owner)
    ? getManageSkillsRoute(owner.sId, skillId)
    : undefined;

  return (
    <Chip
      label={skillName}
      icon={getSkillIcon(skillIcon ?? null)}
      href={href}
      target={href ? "_blank" : undefined}
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
