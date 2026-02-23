import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import * as ts from "typescript";

export interface ValidationWarning {
  type: "tailwind" | "typescript";
  message: string;
  oldString?: string;
  suggestion?: string;
  occurrences?: number;
}

// Maximum number of syntax errors to display in validation error messages.
// Additional errors beyond this limit are summarized with a count.
const MAX_DISPLAYED_ERRORS = 5;

// Regular expression to capture the value inside a className attribute.
// We check both double and single quotes separately to handle mixed usage.
const classNameRegex = /className\s*=\s*["']([^"']*)["']/g;

// Regular expression to capture Tailwind arbitrary values:
// Matches a word boundary, then one or more lowercase letters or hyphens,
// followed by a dash, an opening bracket, one or more non-']' characters, and a closing bracket.
const arbitraryRegex = /\b[a-z-]+-\[[^\]]+\]/g;

/**
 * Validates that the generated code doesn't contain Tailwind arbitrary values.
 *
 * Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] cause visualization failures because
 * they're not included in our pre-built CSS. Returns structured warnings with context that
 * can be used directly in edit operations.
 */
export function validateTailwindCode(
  code: string
): Result<undefined, ValidationWarning[]> {
  const warnings: ValidationWarning[] = [];

  // Find all className attributes in the code (single pass).
  const matches = [...code.matchAll(classNameRegex)];

  // Count occurrences of each unique className attribute.
  const occurrenceCounts = new Map<string, number>();
  for (const match of matches) {
    const fullMatch = match[0];
    occurrenceCounts.set(fullMatch, (occurrenceCounts.get(fullMatch) ?? 0) + 1);
  }

  for (const match of matches) {
    const classContent = match[1];
    if (!classContent) {
      continue;
    }

    // Check if this className contains arbitrary values.
    const arbitraryMatches = [...classContent.matchAll(arbitraryRegex)];
    if (arbitraryMatches.length === 0) {
      continue;
    }

    // Get the full className attribute as context.
    const fullMatch = match[0]; // e.g., 'className="h-[600px] w-[800px]"'.
    const occurrences = occurrenceCounts.get(fullMatch);

    // For each arbitrary value in this className, create a warning.
    // We use the full className attribute as the oldString to avoid overlaps.
    for (const arbMatch of arbitraryMatches) {
      const arbitraryValue = arbMatch[0];

      warnings.push({
        type: "tailwind",
        message: `Forbidden Tailwind arbitrary value '${arbitraryValue}'. Use predefined classes or inline styles instead.`,
        oldString: fullMatch,
        suggestion: `Replace '${arbitraryValue}' with a predefined Tailwind class or use the style prop.`,
        occurrences,
      });
    }
  }

  if (warnings.length > 0) {
    return new Err(warnings);
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

/**
 * Formats validation warnings into a message that the LLM can use to make targeted edits.
 * The formatted message includes the old_string that can be directly used in edit operations.
 *
 * @param warnings - Array of validation warnings from content validation
 * @returns Formatted warning message for LLM consumption
 */
export function formatValidationWarningsForLLM(
  warnings: ValidationWarning[]
): string {
  if (warnings.length === 0) {
    return "";
  }

  let message = "\n\nValidation warnings:\n";

  for (const warning of warnings) {
    message += `\n${warning.type}: ${warning.message}\n`;

    if (warning.oldString) {
      message += `  old_string: """${warning.oldString}"""\n`;
      if (warning.occurrences && warning.occurrences > 1) {
        message += `  expected_replacements: ${warning.occurrences}\n`;
      }
      if (warning.suggestion) {
        message += `  ${warning.suggestion}\n`;
      }
    }
  }

  return message;
}
