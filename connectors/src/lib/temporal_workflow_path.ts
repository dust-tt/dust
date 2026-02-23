import path from "path";

/**
 * Resolves the absolute path to a connector's workflow entry point.
 *
 * Temporal's Worker.create() needs a filesystem path to the workflow source for
 * its internal webpack bundling. Using require.resolve("./workflows") only works
 * when running from the source tree (e.g., via tsx). When the worker is bundled
 * with esbuild into a single dist/ file, the relative path context changes and
 * the resolution fails.
 *
 * This helper constructs an absolute path using process.cwd(), which is the
 * connectors project root in both development and production.
 */
export function resolveConnectorWorkflowsPath(
  connectorName: string,
  subpath: string = "workflows"
): string {
  return path.resolve(
    process.cwd(),
    "src",
    "connectors",
    connectorName,
    "temporal",
    subpath
  );
}
