import { visit } from "unist-util-visit";

type TextDirectiveAttributes = Record<string, string | undefined>;

export function createTextDirective(
  directiveName: string,
  getProperties: (
    label: string,
    attributes: TextDirectiveAttributes
  ) => TextDirectiveAttributes
) {
  return function textDirectivePlugin() {
    return (tree: any) => {
      visit(tree, ["textDirective"], (node) => {
        if (node.name === directiveName && node.children[0]) {
          const data = node.data ?? {};
          node.data = data;
          data.hName = directiveName;
          data.hProperties = getProperties(
            node.children[0].value,
            node.attributes ?? {}
          );
        }
      });
    };
  };
}
