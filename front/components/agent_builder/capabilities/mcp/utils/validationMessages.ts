/**
 * Field-specific validation error messages for better UX
 * Centralized message management for consistency across forms
 */
export const VALIDATION_MESSAGES = {
  childAgent: {
    required: "Child agent selection is required",
    invalid: "Please select a valid child agent",
  },
  reasoningModel: {
    required: "Reasoning model configuration is required",
    invalid: "Please configure a valid reasoning model",
  },
  dustApp: {
    required: "Please select a Dust app",
    invalid: "Selected Dust app is not valid",
  },
  additionalConfig: {
    stringRequired: (key: string) => `${key} is required`,
    numberRequired: (key: string) => `${key} must be a valid number`,
    booleanRequired: (key: string) => `${key} must be selected`,
    enumRequired: (key: string) =>
      `${key} must be selected from available options`,
    genericRequired: "All required configuration fields must be filled",
  },
  name: {
    empty: "The name cannot be empty.",
    format:
      "The name can only contain lowercase letters, numbers, and underscores (no spaces).",
  },
  description: {
    required: "Description is required",
    tooLong: "Description too long",
  },
} as const;
