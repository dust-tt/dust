import { classNames } from "@dust-tt/sparkle";
import { visit } from "unist-util-visit";

/*
 * Remark directive plugin for parsing user mention directives.
 *
 * Transforms `:mention_user[name]{sId=xxx}` into a custom HTML element
 * that can be rendered by the mention component.
 *
 */
export function userMentionDirective() {
  return (tree: any) => {
    visit(tree, ["textDirective"], (node) => {
      if (node.name === "mention_user" && node.children[0]) {
        const data = node.data || (node.data = {});
        data.hName = "mention_user";
        data.hProperties = {
          userSid: node.attributes.sId,
          userName: node.children[0].value,
        };
      }
    });
  };
}

/**
 * Creates a React component plugin for rendering user mentions in markdown.
 *
 * This function returns a component that can be used as a custom component
 * in ReactMarkdown to render the mention HTML elements.
 *
 * @returns A React component for rendering mentions
 */
export function getUserMentionPlugin() {
  const UserMentionPlugin = ({ userName }: { userName: string }) => {
    return (
      <span
        className={classNames(
          "inline-block cursor-pointer font-medium text-highlight",
          "dark:text-highlight-night"
        )}
      >
        @{userName}
      </span>
    );
  };

  return UserMentionPlugin;
}
