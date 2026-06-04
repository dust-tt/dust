import {
  SKILL_NODE_TYPE,
  SkillNode as SkillNodeBase,
} from "@app/components/editor/extensions/skill_builder/SkillNode";
import { SkillNodeComponent } from "@app/components/editor/input_bar/SkillNodeComponent";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type { SkillNodeAttributes } from "@app/components/editor/extensions/skill_builder/SkillNode";
export { SKILL_NODE_TYPE };

// Interactive variant of SkillNode that adds the React node view. The
// schema-only base lives in skill_builder/SkillNode so server-side code can
// register the node without pulling in React.
export const SkillNode = SkillNodeBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(SkillNodeComponent);
  },
});
