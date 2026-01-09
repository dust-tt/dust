import * as ts from "typescript";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

// Maximum number of syntax errors to display in validation error messages.
// Additional errors beyond this limit are summarized with a count.
const MAX_DISPLAYED_ERRORS = 5;

// Regular expressions to capture the value inside a className attribute.
// We check both double and single quotes separately to handle mixed usage.
const classNameDoubleQuoteRegex = /className\s*=\s*"([^"]*)"/g;
const classNameSingleQuoteRegex = /className\s*=\s*'([^']*)'/g;

// Regular expression to capture Tailwind arbitrary values:
// Matches a word boundary, then one or more lowercase letters or hyphens,
// followed by a dash, an opening bracket, one or more non-']' characters, and a closing bracket.
const arbitraryRegex = /\b[a-z-]+-\[[^\]]+\]/g;

/**
 * Validates that the generated code doesn't contain Tailwind arbitrary values.
 *
 * Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] cause visualization failures
 * because they're not included in our pre-built CSS. This validation fails fast with
 * a clear error message that gets exposed to the user, allowing them to retry which
 * provides the error details to the model for correction.
 */
export function validateTailwindCode(code: string): Result<undefined, Error> {
  const matches: string[] = [];

  // Check double-quoted className attributes
  let classMatch: RegExpExecArray | null = null;
  while ((classMatch = classNameDoubleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) ?? [];
      matches.push(...arbitraryMatches);
    }
  }

  // Check single-quoted className attributes
  while ((classMatch = classNameSingleQuoteRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) ?? [];
      matches.push(...arbitraryMatches);
    }
  }

  // If we found any, remove duplicates and throw an error with up to three examples.
  if (matches.length > 0) {
    const uniqueMatches = Array.from(new Set(matches));
    const examples = uniqueMatches.slice(0, 3).join(", ");
    return new Err(
      new Error(
        `Forbidden Tailwind arbitrary values detected: ${examples}. ` +
          `Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] are not allowed. ` +
          `Use predefined classes like h-96, w-full, bg-red-500 instead, or use the style prop for specific values.`
      )
    );
  }
  return new Ok(undefined);
}

/**
 * Validates TypeScript/JSX syntax in the generated code.
 *
 * Uses the TypeScript transpileModule API with diagnostics reporting enabled
 * to catch syntax errors before the file is saved. This primarily validates:
 * - JSX syntax errors (unclosed tags, malformed elements)
 * - TypeScript syntax errors (unexpected tokens, invalid syntax)
 * - Malformed code structure
 *
 * Note: This performs syntax validation only, not full semantic type checking.
 * Undefined variables and type errors may not be caught, as transpileModule
 * does not perform full type checking without a complete program context.
 *
 * References:
 * - TypeScript Compiler API: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
 * - transpileModule API: https://github.com/microsoft/TypeScript/blob/main/src/services/transpile.ts
 * - Limitation discussion: https://github.com/microsoft/TypeScript/issues/4864
 */
export function validateTypeScriptSyntax(
  code: string
): Result<undefined, Error> {
  try {
    // Use transpileModule with diagnostics enabled for syntax validation.
    const result = ts.transpileModule(code, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.React,
        strict: false,
        skipLibCheck: true,
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
      reportDiagnostics: true,
      fileName: "temp.tsx",
    });

    // Filter out diagnostics that are expected for generated code.
    const filteredDiagnostics = (result.diagnostics ?? []).filter(
      (diagnostic) => {
        // Ignore certain error codes that are expected during standalone validation:
        // - TS2307: Cannot find module (imports may not be resolvable without node_modules)
        // - TS7016: Could not find declaration file for module
        // - TS2304: Cannot find name (transpileModule doesn't perform full type checking)
        //
        // Note: Syntax errors like unclosed JSX tags, malformed elements, and unexpected tokens
        // are still caught and reported.
        const ignoredCodes = [2307, 2304, 7016];
        return !ignoredCodes.includes(diagnostic.code);
      }
    );

    if (filteredDiagnostics.length > 0) {
      // Format diagnostics in the same style as tsc output.
      const formattedErrors = filteredDiagnostics
        .slice(0, MAX_DISPLAYED_ERRORS)
        .map((diagnostic) => {
          const message = ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
          );

          if (diagnostic.file && diagnostic.start !== undefined) {
            const { line, character } =
              diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            return `Line ${line + 1}, Column ${character + 1}: error TS${diagnostic.code}: ${message}`;
          }

          return `error TS${diagnostic.code}: ${message}`;
        });

      const errorCount = filteredDiagnostics.length;
      const errorSummary = formattedErrors.join("\n");
      const additionalErrors =
        errorCount > MAX_DISPLAYED_ERRORS
          ? ` (and ${errorCount - MAX_DISPLAYED_ERRORS} more errors)`
          : "";

      return new Err(
        new Error(
          `TypeScript syntax errors detected${additionalErrors}:\n\n${errorSummary}\n\nPlease fix these errors and try again.`
        )
      );
    }

    return new Ok(undefined);
  } catch (error) {
    return new Err(
      new Error(
        `Failed to validate TypeScript syntax: ${normalizeError(error)}`
      )
    );
  }
}
