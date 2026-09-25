import { SKIP, visit } from "unist-util-visit";

export function makeSuggestionDirective(name: string, targetAttribute: string) {
  return makeDirective(name, (attributes) => ({
    suggestionId: attributes.sId,
    kind: attributes.kind,
    [targetAttribute]: attributes[targetAttribute],
  }));
}

/**
 * Builds the remark plugin of a directive: it renders `:<name>[]{key=value ...}` as a `<name>`
 * element whose properties are built from the directive attributes by `toProperties`.
 */
export function makeDirective(
  name: string,
  toProperties: (attributes: Record<string, string>) => Record<string, string>
) {
  const leakedPrefixPattern = new RegExp(`::${name}\\[\\]\\{([^}]*)\\}`);

  return () => (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name === name) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = name;
        data.hProperties = toProperties(node.attributes);
      }
    });

    // Models may not output a newline before the directive (e.g. "issues::<name>[]{sId=xxx}"):
    // the prefix prevents remarkDirective from parsing it, so we drop it and render the directive.
    visit(tree, "text", (node, index, parent) => {
      if (!parent || index === null) {
        return;
      }
      const match = leakedPrefixPattern.exec(node.value);
      if (!match) {
        return;
      }
      const attrs = Object.fromEntries(
        [...match[1].matchAll(/(\w+)=([^\s}]+)/g)].map((m) => [m[1], m[2]])
      );
      // Replace the entire text node (incl. leaked prefix) with a leafDirective node.
      parent.children = [
        ...parent.children.slice(0, index),
        {
          type: "leafDirective",
          name,
          attributes: attrs,
          children: [],
          data: {
            hName: name,
            hProperties: toProperties(attrs),
          },
        },
        ...parent.children.slice(index + 1),
      ];

      return [SKIP, index];
    });
  };
}
