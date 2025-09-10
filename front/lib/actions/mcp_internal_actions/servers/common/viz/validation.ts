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
  classNameDoubleQuoteRegex.lastIndex = 0; // Reset regex state
  while ((classMatch = classNameDoubleQuoteRegex.exec(code)) !== null) {
    checkClassNameContent(classMatch[1]);
  }

  classNameSingleQuoteRegex.lastIndex = 0; // Reset regex state
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
