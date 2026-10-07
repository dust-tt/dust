import { msg } from "@lingui/core/macro";

/**
 * Field-specific validation error messages for better UX
 * Centralized message management for consistency across forms
 */
export const VALIDATION_MESSAGES = {
  childAgent: {
    required: msg`Child agent selection is required`,
    invalid: msg`Please select a valid child agent`,
  },
  dustApp: {
    required: msg`Please select a Dust app`,
    invalid: msg`Selected Dust app is not valid`,
  },
  name: {
    empty: msg`The name cannot be empty.`,
    format: msg`The name can only contain lowercase letters, numbers, and underscores (no spaces).`,
  },
  description: {
    required: msg`Description is required`,
    tooLong: msg`Description too long`,
  },
  secret: {
    required: msg`Secret selection is required`,
    invalid: msg`Please select a valid secret`,
  },
  dustProject: {
    required: msg`Please select one Pod`,
    invalid: msg`Selected Pod is not valid`,
  },
} as const;
