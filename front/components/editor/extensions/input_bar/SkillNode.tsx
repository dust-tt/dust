import {
  SKILL_NODE_TYPE,
  SkillNode as SkillNodeBase,
} from "@app/components/editor/extensions/skill_builder/SkillNode";
import { SkillNodeComponent } from "@app/components/editor/input_bar/SkillNodeComponent";
import { useIsEditorEditable } from "@app/components/editor/lib/useIsEditorEditable";
import type { NodeViewProps } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";

export type { SkillNodeAttributes } from "@app/components/editor/extensions/skill_builder/SkillNode";
export { SKILL_NODE_TYPE };

interface SkillNodeOptions {
  onSkillDetails?: (skillId: string) => void;
}

function SkillNodeView({
  deleteNode,
  editor,
  node,
  onDetails,
}: NodeViewProps & { onDetails?: (skillId: string) => void }) {
  const isEditable = useIsEditorEditable(editor);

  return (
    <SkillNodeComponent
      node={{ attrs: node.attrs }}
      onDetails={onDetails}
      onRemove={isEditable ? deleteNode : undefined}
    />
  );
}

// Interactive variant of SkillNode that adds the React node view. The
// schema-only base lives in skill_builder/SkillNode so server-side code can
// register the node without pulling in React.
export const SkillNode = SkillNodeBase.extend<SkillNodeOptions>({
  addOptions() {
    return {
      ...this.parent?.(),
      onSkillDetails: undefined,
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer((props: NodeViewProps) => (
      <SkillNodeView {...props} onDetails={this.options.onSkillDetails} />
    ));
  },
});
