import {
  AudioContentSchema,
  CallToolResultSchema as OriginalCallToolResultSchema,
  EmbeddedResourceSchema,
  ImageContentSchema as OriginalImageContentSchema,
  TextContentSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * Forked MCP CallToolResult schemas to fix base64 validation circular reference issue.
 *
 * PROBLEM:
 * The original MCP SDK's ImageContentSchema uses `z.string().base64()` which causes
 * "RangeError: Maximum call stack size exceeded" errors when validating large base64
 * image data (typically >1MB). This is a known bug in Zod's base64 validation regex
 * that creates infinite recursion with large strings.
 *
 * ROOT CAUSE:
 * - Zod's `.base64()` validator uses a complex regex that can cause stack overflow
 * - The issue affects both Zod v3 and v4, particularly with large base64 strings
 * - Image generation tools often return multi-MB base64 encoded images
 * - The MCP SDK's strict validation triggers this bug during tool response processing
 *
 * RELATED ISSUES:
 * - https://github.com/colinhacks/zod/issues/4283 (base64 validation stack overflow)
 *
 * SOLUTION:
 * We fork only the ImageContentSchema to remove the `.base64()` validation while
 * keeping all other MCP SDK type safety. This allows large image data to pass through
 * without validation while maintaining the expected schema structure.
 *
 * TRADE-OFFS:
 * - We lose base64 format validation for image data
 * - We trust MCP servers to provide valid base64 (which they should anyway)
 * - We avoid the stack overflow and maintain functionality
 *
 * TODO:
 * Remove this workaround when either:
 * 1. Zod fixes the base64 validation recursion bug, OR
 * 2. MCP SDK switches to a different validation approach for large binary data
 *
 * @see https://github.com/modelcontextprotocol/typescript-sdk for upstream MCP SDK
 */

// FORKED: Fixed ImageContentSchema without .base64() validation.
export const ImageContentSchema = OriginalImageContentSchema.extend({
  /**
   * The base64-encoded image data.
   *
   * IMPORTANT: We removed .base64() validation here to prevent "Maximum call stack
   * size exceeded" errors with large image data. The MCP server is trusted to
   * provide valid base64 encoding.
   */
  data: z.string(), // FIXED: was z.string().base64().
});

// FORKED: ContentBlockSchema using our fixed ImageContentSchema
export const ContentBlockSchema = z.union([
  TextContentSchema,
  ImageContentSchema, // Uses our fixed version without base64 validation
  AudioContentSchema,
  EmbeddedResourceSchema,
]);

// FORKED: CallToolResultSchema using our fixed ContentBlockSchema
export const CallToolResultSchemaWithoutBase64Validation =
  OriginalCallToolResultSchema.extend({
    /**
     * Override content array to use our fixed ContentBlockSchema that doesn't
     * validate base64 format for images.
     */
    content: z.array(ContentBlockSchema).default([]),
  });
