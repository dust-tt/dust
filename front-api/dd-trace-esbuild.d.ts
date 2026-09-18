declare module "dd-trace/esbuild" {
  import type { Plugin } from "esbuild";

  const datadogEsbuildPlugin: Plugin;
  export default datadogEsbuildPlugin;
}
