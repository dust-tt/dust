// index-template.js
const path = require("path");

/**
 * Export names kept alive after their SVG source was retired.
 *
 * Keyed by the export name to emit, valued by the generated module it should
 * resolve to. Each entry is a migration shim, not a feature: it lets an icon be
 * replaced without changing every call site in the same breath. Delete the entry
 * once its consumers import the target name directly.
 */
const DEPRECATED_ALIASES = {
  // `cloud-arrow-left-right.svg` was retired in favour of `sync-cloud-02.svg`.
  // `CloudArrowLeftRight` is the "Connections" icon, imported from
  // `@dust-tt/sparkle` by ~26 files across front/ and marketing/ (spaces, data
  // sources, connectors, agent builder, pod, labs, paywall), so it stays
  // exported here and now renders the SyncCloud02 artwork. Remove this entry
  // once those call sites have moved to `SyncCloud02`.
  CloudArrowLeftRight: "SyncCloud02",
};

function defaultIndexTemplate(filePaths) {
  const basenames = filePaths.map(({ path: filePath }) =>
    path.basename(filePath, path.extname(filePath))
  );

  // "Container" would collide with the existing `Container` component export
  // from sparkle, so it is exported as `ContainerIcon` instead.
  const exportNameFor = (basename) =>
    basename === "Container" ? "ContainerIcon" : basename;

  const exportEntries = basenames.map(
    (basename) =>
      `export { default as ${exportNameFor(basename)} } from './${basename}'`
  );

  const modules = new Set(basenames);
  const exportNames = new Set(basenames.map(exportNameFor));

  // Both guards below mean the alias map has drifted from the icon set, and both
  // throw rather than skipping quietly. Dropping an alias silently would break
  // its call sites with a "no exported member" error far from the cause, and
  // silently letting a re-added SVG win would change what the icon looks like
  // without anyone noticing. A regenerate is run by hand, so failing here is the
  // cheapest possible place to find out.
  const aliasEntries = Object.entries(DEPRECATED_ALIASES).map(
    ([aliasName, target]) => {
      if (!modules.has(target)) {
        throw new Error(
          `Deprecated alias "${aliasName}" points at "${target}", which is not in the generated set. ` +
            `Add ${target}.svg back, or drop the alias and migrate its call sites.`
        );
      }
      if (exportNames.has(aliasName)) {
        throw new Error(
          `Deprecated alias "${aliasName}" collides with a real icon export of the same name. ` +
            `The SVG source it was standing in for is back, so remove the alias from DEPRECATED_ALIASES.`
        );
      }
      return `export { default as ${aliasName} } from './${target}'`;
    }
  );

  return [...exportEntries, ...aliasEntries].join("\n");
}

module.exports = defaultIndexTemplate;
