import { ChevronDownIcon, Chip, cn } from "@dust-tt/sparkle";
import React from "react";
import { visit } from "unist-util-visit";

import { TAG_NAME_PATTERN } from "@app/components/editor/extensions/agent_builder/instructionBlockUtils";

type InstructionBlockProps = {
  tagName: string;
  children: React.ReactNode;
};

/**
 * Renders an instruction block with styled tag chips in readonly markdown display.
 * This matches the visual style used in the agent builder editor, but always expanded.
 */
export function InstructionBlock({ tagName, children }: InstructionBlockProps) {
  const displayType = tagName.toUpperCase();

  return (
    <div className="my-2 rounded-lg px-1 py-2">
      <div className="flex items-start gap-1">
        {/* Static chevron - matches editor but non-interactive */}
        <div className="mt-[3px] p-0.5">
          <ChevronDownIcon className="text-element-600 dark:text-element-600-night h-4 w-4" />
        </div>
        <div className="mt-0.5 w-full">
          <Chip
            size="mini"
            className="bg-gray-100 transition-colors dark:bg-gray-800"
          >
            {`<${displayType}>`}
          </Chip>
          <div
            className={cn(
              "prose prose-sm",
              // Match heading styles from editor
              "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:text-xl",
              "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:font-semibold",
              "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mt-4",
              "[&_h1,&_h2,&_h3,&_h4,&_h5,&_h6]:mb-3"
            )}
          >
            {children}
          </div>
          <Chip
            size="mini"
            className="bg-gray-100 transition-colors dark:bg-gray-800"
          >
            {`</${displayType}>`}
          </Chip>
        </div>
      </div>
    </div>
  );
}

/**
 * Remark directive that transforms :::instruction_block[tagName] containers
 * into instruction_block elements.
 */
export function instructionBlockDirective() {
  return (tree: any) => {
    visit(tree, ["containerDirective"], (node) => {
      if (node.name === "instruction_block") {
        const data = node.data ?? (node.data = {});
        // Get tag name from the directive label (the [tagName] part)
        const tagName =
          node.children?.[0]?.children?.[0]?.value ?? "instructions";

        data.hName = "instruction_block";
        data.hProperties = {
          tagName: tagName,
        };

        // Remove the label node from children since we extracted it
        // The remaining children are the actual content
        if (node.children?.[0]?.children?.[0]?.type === "text") {
          node.children = node.children.slice(1);
        }
      }
    });
  };
}

/**
 * Preprocesses markdown content to convert XML-style instruction blocks
 * to remark-directive syntax for proper rendering.
 *
 * Converts: <tagname>content</tagname>
 * To: :::instruction_block[tagname]\ncontent\n:::
 *
 * This enables react-markdown with remark-directive to parse and render
 * instruction blocks correctly.
 */
export function preprocessInstructionBlocks(content: string): string {
  // Match opening tag, content, and closing tag
  // Uses the same pattern as InstructionBlockExtension for consistency
  const INSTRUCTION_BLOCK_REGEX = new RegExp(
    `<(${TAG_NAME_PATTERN})>([\\s\\S]*?)</\\1>`,
    "gi"
  );

  return content.replace(
    INSTRUCTION_BLOCK_REGEX,
    (match, tagName, innerContent) => {
      // Convert to remark-directive container syntax
      // The tagName goes in brackets as a label
      return `:::instruction_block[${tagName}]\n${innerContent}\n:::\n`;
    }
  );
}
