import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

// Regular expression to capture the value inside a className attribute. This pattern assumes
// double quotes for simplicity.
const classNameRegex = /className\s*=\s*"([^"]*)"/g;

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
export function validateTailwindArbitraryValues(
  code: string
): Result<void, Error> {
  const matches: Array<{ value: string; line: number; context: string }> = [];
  let classMatch: RegExpExecArray | null = null;

  // Split code into lines for better error reporting
  const lines = code.split("\n");

  // Iterate through all occurrences of the className attribute in the code.
  while ((classMatch = classNameRegex.exec(code)) !== null) {
    const classContent = classMatch[1];
    if (classContent) {
      // Find all matching arbitrary values within the class attribute's value.
      const arbitraryMatches = classContent.match(arbitraryRegex) || [];

      // Find the line number and context for each match
      const matchIndex = classMatch.index;
      const lineNumber = code.substring(0, matchIndex).split("\n").length;
      const lineContent = lines[lineNumber - 1] || "";

      arbitraryMatches.forEach((match) => {
        matches.push({
          value: match,
          line: lineNumber,
          context: lineContent.trim(),
        });
      });
    }
  }

  // If we found any, remove duplicates and throw an error with specific examples.
  if (matches.length > 0) {
    const uniqueMatches = Array.from(
      new Map(matches.map((m) => [m.value, m])).values()
    );

    const examples = uniqueMatches
      .slice(0, 3)
      .map(
        (match) => `"${match.value}" on line ${match.line}: ${match.context}`
      )
      .join("\n  - ");

    return new Err(
      new Error(
        `Forbidden Tailwind arbitrary values detected:\n  - ${examples}\n\n` +
          `Arbitrary values like h-[600px], w-[800px], bg-[#ff0000] are not allowed. ` +
          `Use predefined classes like h-96, w-full, bg-red-500 instead, or use the style prop for specific values.`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Validates JSX syntax and common errors
 */
export function validateJSXSyntax(content: string): Result<void, Error> {
  const errors: Array<{ pattern: string; line: number; context: string }> = [];
  const lines = content.split("\n");

  // Check for common JSX syntax errors
  const jsxErrorPatterns = [
    {
      pattern: /<[A-Z][^>]*>[^<]*<\/[a-z]/g,
      description:
        "Mismatched case in closing tags (uppercase opening, lowercase closing)",
    },
    {
      pattern: /<[a-z][^>]*>[^<]*<\/[A-Z]/g,
      description:
        "Mismatched case in closing tags (lowercase opening, uppercase closing)",
    },
    {
      pattern: /<[^>]*\s+[^=]*\s*=\s*[^"'>\s][^"'>]*[^"'>\s]/g,
      description: "Unquoted attribute values",
    },
  ];

  jsxErrorPatterns.forEach(({ pattern, description }) => {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const lineContent = lines[lineNumber - 1] || "";

      errors.push({
        pattern: description,
        line: lineNumber,
        context: lineContent.trim(),
      });
    }
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .slice(0, 3)
      .map(
        (error) =>
          `Line ${error.line}: ${error.pattern}\n  Context: ${error.context}`
      )
      .join("\n\n");

    return new Err(
      new Error(
        `JSX syntax errors detected:\n\n${errorDetails}\n\n` +
          `Please ensure all JSX elements have properly matched tags and quoted attribute values.`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Validates that Tailwind classes are properly used
 */
export function validateTailwindUsage(content: string): Result<void, Error> {
  const tailwindPatterns = [
    /className\s*=\s*["'][^"']*["']/g,
    /bg-\w+/g,
    /text-\w+/g,
    /p-\w+/g,
    /m-\w+/g,
    /flex/g,
    /grid/g,
  ];

  const hasTailwindClasses = tailwindPatterns.some((pattern) =>
    pattern.test(content)
  );

  if (!hasTailwindClasses && content.includes("className")) {
    // Find the line with className that has no valid Tailwind classes
    const lines = content.split("\n");
    const classNameLines = lines
      .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
      .filter(
        ({ line }) =>
          line.includes("className") &&
          !tailwindPatterns.some((pattern) => pattern.test(line))
      );

    const errorDetails = classNameLines
      .slice(0, 3)
      .map(({ line, lineNumber }) => `Line ${lineNumber}: ${line}`)
      .join("\n  - ");

    return new Err(
      new Error(
        `Content appears to use className but no valid Tailwind classes detected:\n  - ${errorDetails}\n\n` +
          `Please use proper Tailwind CSS classes. Examples: bg-blue-500, text-white, p-4, m-2, flex, grid`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Validates security by checking for dangerous patterns
 */
export function validateSecurity(content: string): Result<void, Error> {
  const dangerousPatterns = [
    { pattern: /<script/i, description: "Script tags" },
    { pattern: /javascript:/i, description: "JavaScript URLs" },
    { pattern: /on\w+\s*=/i, description: "Event handlers" },
    { pattern: /eval\s*\(/i, description: "eval() function calls" },
    { pattern: /Function\s*\(/i, description: "Function constructor calls" },
  ];

  const errors: Array<{ description: string; line: number; context: string }> =
    [];
  const lines = content.split("\n");

  dangerousPatterns.forEach(({ pattern, description }) => {
    let match: RegExpExecArray | null = null;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split("\n").length;
      const lineContent = lines[lineNumber - 1] || "";

      errors.push({
        description,
        line: lineNumber,
        context: lineContent.trim(),
      });
    }
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .slice(0, 3)
      .map(
        (error) =>
          `Line ${error.line}: ${error.description}\n  Context: ${error.context}`
      )
      .join("\n\n");

    return new Err(
      new Error(
        `Potentially dangerous patterns detected:\n\n${errorDetails}\n\n` +
          `Please remove any script tags, event handlers, or eval statements for security reasons.`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Validates specific import requirements for different contexts
 */
export function validateImports(
  content: string,
  requiredImports: Array<{
    import: string;
    usage: string;
    message: string;
  }>
): Result<void, Error> {
  const errors: Array<{
    import: string;
    usage: string;
    message: string;
    line: number;
    context: string;
  }> = [];
  const lines = content.split("\n");

  requiredImports.forEach(({ import: importPattern, usage, message }) => {
    const usageRegex = new RegExp(
      usage.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      "g"
    );

    if (usageRegex.test(content) && !content.includes(importPattern)) {
      // Find the line where the usage occurs
      let match: RegExpExecArray | null = null;
      while ((match = usageRegex.exec(content)) !== null) {
        const lineNumber = content.substring(0, match.index).split("\n").length;
        const lineContent = lines[lineNumber - 1] || "";

        errors.push({
          import: importPattern,
          usage,
          message,
          line: lineNumber,
          context: lineContent.trim(),
        });
      }
    }
  });

  if (errors.length > 0) {
    const errorDetails = errors
      .slice(0, 3)
      .map(
        (error) =>
          `Line ${error.line}: Using "${error.usage}" but missing import\n  Context: ${error.context}\n  Required: ${error.import}`
      )
      .join("\n\n");

    return new Err(
      new Error(
        `Missing required imports:\n\n${errorDetails}\n\n` +
          `Please add the required import statements at the top of the file.`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Comprehensive validation function that combines all validations
 */
export function validateContent(
  content: string,
  options: {
    validateTailwindArbitrary?: boolean;
    validateJSX?: boolean;
    validateTailwindUsage?: boolean;
    validateSecurity?: boolean;
    requiredImports?: Array<{ import: string; usage: string; message: string }>;
  } = {}
): Result<void, Error> {
  const {
    validateTailwindArbitrary: shouldValidateTailwindArbitrary = true,
    validateJSX: shouldValidateJSX = true,
    validateTailwindUsage: shouldValidateTailwindUsage = true,
    validateSecurity: shouldValidateSecurity = true,
    requiredImports = [],
  } = options;

  // Validate Tailwind arbitrary values
  if (shouldValidateTailwindArbitrary) {
    const tailwindValidation = validateTailwindArbitraryValues(content);
    if (tailwindValidation.isErr()) {
      return tailwindValidation;
    }
  }

  // Validate JSX syntax
  if (shouldValidateJSX) {
    const jsxValidation = validateJSXSyntax(content);
    if (jsxValidation.isErr()) {
      return jsxValidation;
    }
  }

  // Validate Tailwind usage
  if (shouldValidateTailwindUsage) {
    const tailwindUsageValidation = validateTailwindUsage(content);
    if (tailwindUsageValidation.isErr()) {
      return tailwindUsageValidation;
    }
  }

  // Validate security
  if (shouldValidateSecurity) {
    const securityValidation = validateSecurity(content);
    if (securityValidation.isErr()) {
      return securityValidation;
    }
  }

  // Validate required imports
  if (requiredImports.length > 0) {
    const importsValidation = validateImports(content, requiredImports);
    if (importsValidation.isErr()) {
      return importsValidation;
    }
  }

  return new Ok(undefined);
}
