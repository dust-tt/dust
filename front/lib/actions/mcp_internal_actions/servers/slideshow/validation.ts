import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

/**
 * Validates Tailwind CSS code for slideshow content
 */
export function validateTailwindCode(content: string): Result<void, Error> {
  // Basic validation - check for common Tailwind patterns
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

  // Check for potential XSS patterns
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
