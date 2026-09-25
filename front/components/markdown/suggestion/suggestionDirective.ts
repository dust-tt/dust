import { SKIP, visit } from "unist-util-visit";

/**
 * Builds a remark plugin that turns `:<name>[]{sId=xxx kind=yyy <targetAttribute>=zzz}` into a
 * custom `<name>` element whose properties are `suggestionId`, `kind` and `<targetAttribute>`.
 */
export function makeSuggestionDirective(name: string, targetAttribute: string) {
  const toSuggestionProperties = (attributes: Record<string, string>) => ({
    suggestionId: attributes.sId,
    kind: attributes.kind,
    [targetAttribute]: attributes[targetAttribute],
  });
  const leakedPrefixPattern = new RegExp(`::${name}\\[\\]\\{([^}]*)\\}`);

  return () => (tree: any) => {
    visit(tree, ["textDirective", "leafDirective"], (node) => {
      if (node.name === name) {
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        const data = node.data || (node.data = {});
        data.hName = name;
        data.hProperties = toSuggestionProperties(node.attributes);
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
            hProperties: toSuggestionProperties(attrs),
          },
        },
        ...parent.children.slice(index + 1),
      ];

      return [SKIP, index];
    });
  };
}
