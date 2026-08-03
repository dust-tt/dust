import { join } from "node:path";

import type { Options as SwaggerJsdocOptions } from "swagger-jsdoc";
import swaggerJsdoc from "swagger-jsdoc";

interface BuildSwaggerSpecOptions {
  apiFolder: string;
  schemaFolders?: string[];
  definition: SwaggerJsdocOptions["definition"];
}

// Build an OpenAPI spec by scanning route files for `@swagger` JSDoc annotations.
// Replaces `next-swagger-doc`'s `createSwaggerSpec`: same glob-building behavior,
// minus its Next.js-only bits (`.next/server` build-dir scanning and the
// `__NEXT_ROUTER_BASEPATH` server injection), neither of which applies to our
// Hono server.
export function buildSwaggerSpec({
  apiFolder,
  schemaFolders = [],
  definition,
}: BuildSwaggerSpecOptions): object {
  const scanFolders = [apiFolder, ...schemaFolders];
  const apis = scanFolders.flatMap((folder) => {
    const apiDirectory = join(process.cwd(), folder);
    const publicDirectory = join(process.cwd(), "public");
    const fileTypes = ["ts", "tsx", "jsx", "js", "json", "swagger.yaml"];
    return [
      ...fileTypes.map((fileType) => `${apiDirectory}/**/*.${fileType}`),
      // Support loading static specs from the public directory.
      ...["swagger.yaml", "json"].map(
        (fileType) => `${publicDirectory}/**/*.${fileType}`
      ),
    ];
  });

  return swaggerJsdoc({ apis, definition });
}
