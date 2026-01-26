import { type Compiler, MultiCompiler } from '../..';
import type { MiddlewareHandler } from '../../config/devServer';
export declare const LAZY_COMPILATION_PREFIX = "/lazy-compilation-using-";
/**
 * Create a middleware that handles lazy compilation requests from the client.
 * This function returns an Express-style middleware that listens for
 * requests triggered by lazy compilation in the dev server client,
 * then invokes the Rspack compiler to compile modules on demand.
 * Use this middleware when integrating lazy compilation into a
 * custom development server instead of relying on the built-in server.
 */
export declare const lazyCompilationMiddleware: (compiler: Compiler | MultiCompiler) => MiddlewareHandler;
