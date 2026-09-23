import postcss from "postcss";
import selectorParser from "postcss-selector-parser";
import valueParser from "postcss-value-parser";

const SCOPE_ROOT = ".viz-sparkle";
const SCOPE_LIMIT = "[data-viz-sparkle-slot]";

/**
 * @cc [owner:flvndvd,label:architecture] viz-only-sparkle-styles
 * Sparkle rules MUST only match inside .viz-sparkle, excluding data-viz-sparkle-slot subtrees.
 */
/**
 * @cc [owner:flvndvd,label:architecture] private-sparkle-css-names
 * Generated custom properties and animations MUST use private names so Frame styles remain unchanged.
 */
export const scopeSparkle = (css) => {
  const root = postcss.parse(css);
  root.walkAtRules("layer", (rule) => {
    if (rule.params === "base") {
      rule.remove();
    }
  });

  const variables = new Map();
  const animations = new Map();
  const output = postcss.root();

  root.walkDecls(({ prop }) => {
    if (prop.startsWith("--")) {
      variables.set(prop, `--viz-sparkle-${prop.slice(2)}`);
    }
  });
  root.walkAtRules("property", ({ params }) =>
    variables.set(params, `--viz-sparkle-${params.slice(2)}`)
  );
  root.walkAtRules("keyframes", ({ params }) =>
    animations.set(params, `viz-sparkle-${params}`)
  );

  root.walkDecls((decl) => {
    const value = valueParser(decl.value);
    value.walk((node) => {
      if (node.type !== "word") {
        return;
      }
      node.value =
        variables.get(node.value) ??
        (decl.prop.includes("animation") || decl.prop.startsWith("--")
          ? animations.get(node.value)
          : undefined) ??
        node.value;
    });
    decl.value = value.toString();
    decl.prop = variables.get(decl.prop) ?? decl.prop;
  });

  root.walkAtRules((rule) => {
    if (rule.name === "property") {
      rule.params = variables.get(rule.params);
      output.append(rule.clone());
      rule.remove();
    }
    if (rule.name === "keyframes") {
      rule.params = animations.get(rule.params);
      output.append(rule.clone());
      rule.remove();
    }
  });

  root.walkRules((rule) => {
    rule.selector = selectorParser((selectors) => {
      selectors.each((selector) => {
        if (selector.toString().trim() === ".dark") {
          selector.replaceWith(
            selectorParser().astSync(":scope:where(.dark, .dark *)").first
          );
          return;
        }
        selector.walkPseudos((node) => {
          if (node.value === ":root" || node.value === ":host") {
            node.value = ":scope";
          }
        });
        selector.walkTags((node) => {
          if (node.value === "html" || node.value === "body") {
            node.replaceWith(selectorParser.pseudo({ value: ":scope" }));
          }
        });
        const first = selector.first;
        if (first?.type === "class" && first.value === "dark") {
          first.replaceWith(
            ...selectorParser().astSync(":scope:where(.dark, .dark *)").first
              .nodes
          );
        }
      });
    }).processSync(rule.selector);
  });

  const scope = postcss.atRule({
    name: "scope",
    params: `(${SCOPE_ROOT}) to (${SCOPE_LIMIT})`,
  });
  scope.append(root.nodes);
  output.append(scope);
  return output.toString();
};
