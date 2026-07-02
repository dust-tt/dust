// Entry point for `node --import`. Registers the esbuild-based module hooks so
// plain `node` can run our TypeScript scripts without `tsx`.
import { register } from "node:module";

register("./esbuild-loader.mjs", import.meta.url);
