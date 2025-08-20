"use strict";

module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow bulk lodash imports in frontend code to prevent bundle bloat",
      category: "Best Practices",
      recommended: true,
      url: "https://lodash.com/docs/4.17.15#lodash",
      explanation: `
        Bulk lodash imports (e.g., import { debounce, throttle } from 'lodash') are problematic in frontend code because:
        
        1. **Bundle Size Impact**: The entire lodash library (~70KB minified) gets included even if you only use 1-2 functions
        2. **Tree Shaking Issues**: Many bundlers struggle to tree-shake lodash effectively when imported as a whole
        3. **Performance**: Larger bundle sizes lead to slower page loads and poor user experience
        4. **Memory Usage**: Unused lodash functions consume unnecessary memory in the browser
        5. **Network Overhead**: More data to download, especially critical on mobile connections
        
        **Solution**: Use individual imports like 'lodash/debounce' which only include the specific function you need.
        This can reduce your bundle size by 90%+ when using only a few lodash utilities.
        
        **Example**:
        ❌ Bad:  import { debounce, throttle } from 'lodash';
        ✅ Good: import debounce from 'lodash/debounce';
                import throttle from 'lodash/throttle';
      `,
    },
    fixable: "code",
    schema: [],
  },

  create(context) {
    return {
      ImportDeclaration(node) {
        if (
          node.source.value === "lodash" &&
          node.specifiers.length > 0 &&
          node.specifiers[0].type === "ImportSpecifier"
        ) {
          const imports = node.specifiers.map((spec) => spec.imported.name);

          context.report({
            node,
            message: `Bulk lodash imports significantly increase bundle size (~70KB). Use individual imports instead (e.g., 'lodash/debounce') to reduce bundle size by 90%+. Importing: ${imports.join(", ")}`,
            fix(fixer) {
              const newImports = imports
                .map((name) => `import ${name} from 'lodash/${name}';`)
                .join("\n");
              return fixer.replaceText(node, newImports);
            },
          });
        }
      },
    };
  },
};
