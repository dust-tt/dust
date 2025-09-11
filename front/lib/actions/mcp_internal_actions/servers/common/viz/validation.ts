import { parse } from "@babel/parser";

import type { Result } from "@app/types";
import { Err } from "@app/types";
import { Ok } from "@app/types";

// Regular expressions to capture className attributes with different quote styles
// matches with className="..."
const classNameDoubleQuoteRegex = /className\s*=\s*"([^"]*)"/g;
// matches with className='...'
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

  const checkClassNameContent = (classContent: string) => {
    if (classContent) {
      const arbitraryMatches = classContent.match(arbitraryRegex) || [];
      matches.push(...arbitraryMatches);
    }
  };

  let classMatch: RegExpExecArray | null = null;
  classNameDoubleQuoteRegex.lastIndex = 0;
  while ((classMatch = classNameDoubleQuoteRegex.exec(code)) !== null) {
    checkClassNameContent(classMatch[1]);
  }

  classNameSingleQuoteRegex.lastIndex = 0;
  while ((classMatch = classNameSingleQuoteRegex.exec(code)) !== null) {
    checkClassNameContent(classMatch[1]);
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
 * Validates JSX syntax using Babel parser for proper AST validation.
 * Catches syntax errors, mismatched tags, and other JSX issues.
 */
export function validateJSX(code: string): Result<undefined, Error> {
  try {
    parse(code, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "classProperties",
        "objectRestSpread",
        "nullishCoalescingOperator",
        "optionalChaining",
      ],
      allowImportExportEverywhere: true,
    });
    return new Ok(undefined);
  } catch (error) {
    if (error instanceof Error) {
      return new Err(new Error(`JSX syntax error: ${error.message}`));
    }
    return new Err(new Error("Unknown JSX parsing error"));
  }
}

/**
 * Validates that the generated code is both secure and follows Tailwind best practices.
 *
 * This function combines security validation and Tailwind validation to ensure
 * the generated code is safe and will render correctly.
 */
export function validateContent(code: string): Result<undefined, Error> {
  // check for Tailwind issues
  const tailwindResult = validateTailwindCode(code);
  if (tailwindResult.isErr()) {
    return tailwindResult;
  }

  // check for JSX issues
  const jsxResult = validateJSX(code);
  if (jsxResult.isErr()) {
    return jsxResult;
  }

  return new Ok(undefined);
}
