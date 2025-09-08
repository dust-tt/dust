import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export function validateJSX(content: string): Result<void, Error> {
  // Check for proper Slideshow import
  if (
    content.includes("Slideshow.") &&
    !content.includes("import { Slideshow }")
  ) {
    return new Err(
      new Error(
        "Slideshow components require proper import. Please add 'import { Slideshow } from \"@dust/slideshow/v1\";' at the top of the file."
      )
    );
  }

  // Check for common JSX syntax errors
  const jsxErrorPatterns = [
    /<[A-Z][^>]*>[^<]*<\/[a-z]/g, // Mismatched case in closing tags
    /<[a-z][^>]*>[^<]*<\/[A-Z]/g, // Mismatched case in closing tags
    /<[^>]*\s+[^=]*\s*=\s*[^"'>\s][^"'>]*[^"'>\s]/g, // Unquoted attribute values
  ];

  const hasJsxErrors = jsxErrorPatterns.some((pattern) =>
    pattern.test(content)
  );

  if (hasJsxErrors) {
    return new Err(
      new Error(
        "Content contains JSX syntax errors. Please ensure all JSX elements have properly matched tags and quoted attribute values."
      )
    );
  }

  return new Ok(undefined);
}

export function validateTailwind(content: string): Result<void, Error> {
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
    return new Err(
      new Error(
        "Content appears to use className but no valid Tailwind classes detected. Please use proper Tailwind CSS classes."
      )
    );
  }

  return new Ok(undefined);
}

export function validateSecurity(content: string): Result<void, Error> {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i,
    /eval\s*\(/i,
    /Function\s*\(/i,
  ];

  const hasDangerousPatterns = dangerousPatterns.some((pattern) =>
    pattern.test(content)
  );

  if (hasDangerousPatterns) {
    return new Err(
      new Error(
        "Content contains potentially dangerous patterns. Please remove any script tags, event handlers, or eval statements."
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Main validation function that validates JSX, Tailwind, and security for slideshow content
 */
export function validateSlideshowContent(content: string): Result<void, Error> {
  // Validate JSX syntax and imports
  const jsxValidation = validateJSX(content);
  if (jsxValidation.isErr()) {
    return jsxValidation;
  }

  // Validate Tailwind CSS
  const tailwindValidation = validateTailwind(content);
  if (tailwindValidation.isErr()) {
    return tailwindValidation;
  }

  // Validate security
  const securityValidation = validateSecurity(content);
  if (securityValidation.isErr()) {
    return securityValidation;
  }

  return new Ok(undefined);
}
