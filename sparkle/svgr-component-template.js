// SVGR component template, identical to SVGR's default except that the type import comes
// first, the order the generated modules were committed with.
const template = (variables, { tpl }) => {
  const imports = [...variables.imports].sort(
    (a, b) => (b.importKind === "type") - (a.importKind === "type")
  );
  return tpl`
${imports};

${variables.interfaces};

const ${variables.componentName} = (${variables.props}) => (
  ${variables.jsx}
);

${variables.exports};
`;
};

module.exports = template;
