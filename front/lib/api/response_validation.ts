/**
 * Utility functions for validating API responses with Zod schemas
 *
 * These helpers make it easy to comply with the dust/require-schema-validation ESLint rule
 * by providing convenient wrappers around schema.strip().parse()
 */

import type { NextApiResponse } from "next";
import type { z } from "zod";

import { apiError } from "@app/logger/withlogging";

/**
 * Validates and strips data using a Zod schema before returning it.
 *
 * Usage:
 * ```typescript
 * return res.status(200).json(
 *   withValidation(MyResponseSchema, { data: myData })
 * );
 * ```
 *
 * @param schema - Zod schema to validate against
 * @param data - Data to validate
 * @returns Validated and stripped data
 * @throws ZodError if validation fails
 */
export function withValidation<T extends z.ZodObject<any>>(
  schema: T,
  data: unknown
): z.infer<T> {
  return schema.strip().parse(data);
}

/**
 * Safely validates data and returns a result object.
 * Useful when you want to handle validation errors explicitly.
 *
 * Usage:
 * ```typescript
 * const result = safeValidation(MyResponseSchema, { data: myData });
 * if (!result.success) {
 *   return apiError(req, res, {
 *     status_code: 500,
 *     api_error: {
 *       type: "internal_server_error",
 *       message: "Response validation failed"
 *     }
 *   });
 * }
 * return res.status(200).json(result.data);
 * ```
 */
export function safeValidation<T extends z.ZodObject<any>>(
  schema: T,
  data: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError } {
  const result = schema.strip().safeParse(data);
  return result;
}

/**
 * Higher-order function that wraps res.json() to automatically validate responses.
 *
 * Usage:
 * ```typescript
 * const jsonValidated = withSchemaValidation(
 *   req,
 *   res,
 *   MyResponseSchema
 * );
 *
 * return jsonValidated(200, { data: myData });
 * ```
 *
 * @param req - Next.js request object (for error reporting)
 * @param res - Next.js response object
 * @param schema - Zod schema to validate against
 * @returns Function that validates and sends JSON response
 */
export function withSchemaValidation<T extends z.ZodObject<any>>(
  req: any,
  res: NextApiResponse,
  schema: T
) {
  return (status: number, data: unknown) => {
    try {
      const validated = schema.strip().parse(data);
      return res.status(status).json(validated);
    } catch (error) {
      // If validation fails, log it and return 500
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Response validation failed",
        },
      });
    }
  };
}

/**
 * Validates an array of items using a schema.
 *
 * Usage:
 * ```typescript
 * return res.status(200).json({
 *   items: withValidationArray(ItemSchema, items)
 * });
 * ```
 */
export function withValidationArray<T extends z.ZodObject<any>>(
  schema: T,
  items: unknown[]
): z.infer<T>[] {
  return items.map(item => schema.strip().parse(item));
}

/**
 * Validates data inline (alias for withValidation for more readable code)
 *
 * Usage:
 * ```typescript
 * return res.status(200).json(
 *   validated(MyResponseSchema, { data: myData })
 * );
 * ```
 */
export const validated = withValidation;

/**
 * Batch validate multiple pieces of data with the same schema
 *
 * Usage:
 * ```typescript
 * const [user, profile] = validateBatch(UserSchema, [userData, profileData]);
 * return res.status(200).json({ user, profile });
 * ```
 */
export function validateBatch<T extends z.ZodObject<any>>(
  schema: T,
  items: unknown[]
): z.infer<T>[] {
  return items.map(item => schema.strip().parse(item));
}
