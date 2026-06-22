import {
  CAPABILITY_SEARCH_NODE_TYPE,
  CapabilitySearchNode,
} from "@app/components/editor/extensions/skill_builder/CapabilitySearchNode";
import {
  type CapabilitySearchNodeOptions,
  CapabilitySearchNodeView,
} from "@app/components/editor/extensions/skill_builder/CapabilitySearchNodeView";
import type { NodeViewProps } from "@tiptap/react";
import { ReactNodeViewRenderer } from "@tiptap/react";

export { CAPABILITY_SEARCH_NODE_TYPE };

const DEFAULT_CAPABILITY_SEARCH_NODE_OPTIONS: CapabilitySearchNodeOptions = {
  currentSkillId: null,
  onSelectSkillRef: { current: undefined },
  onSelectToolRef: { current: undefined },
  onSkillDetailsRef: { current: undefined },
  onToolDetailsRef: { current: undefined },
  owner: undefined,
  selectedMCPServerViewIdsRef: { current: new Set<string>() },
  variant: "skill-builder",
};

function createCapabilitySearchNodeExtension(
  variant: NonNullable<CapabilitySearchNodeOptions["variant"]>
) {
  return CapabilitySearchNode.extend<CapabilitySearchNodeOptions>({
    addOptions() {
      return {
        ...DEFAULT_CAPABILITY_SEARCH_NODE_OPTIONS,
        variant,
      };
    },

    addNodeView() {
      return ReactNodeViewRenderer((props: NodeViewProps) => (
        <CapabilitySearchNodeView {...props} options={this.options} />
      ));
    },
  });
}

export const CapabilitySearchNodeWithView =
  createCapabilitySearchNodeExtension("skill-builder");

export const InputBarCapabilitySearchNode =
  createCapabilitySearchNodeExtension("input-bar");
