export const MCP_VALIDATION = {
  HEADER_NAME_REGEX: /^[a-zA-Z0-9!#$&'*+\-.^_|~]+$/,

  ERROR_MESSAGES: {
    EMPTY_HEADER_NAME: "Header names cannot be empty",
    INVALID_HEADER_NAME: "Use only letters, numbers, and -_.",
    EMPTY_HEADER_VALUE: "cannot have an empty value",
    DUPLICATE_HEADERS: "Duplicate header names are not allowed",
    URL_REQUIRED: "Please provide a valid URL.",
    INVALID_URL:
      "Please provide a valid URL (e.g. https://example.com or https://example.com/a/b/c).",
    BEARER_TOKEN_REQUIRED:
      "Bearer token is required when using bearer token authentication.",
    CUSTOM_HEADERS_VALIDATION_FAILED: "Custom headers validation failed",
  },
} as const;

export type AuthMethod = "none" | "bearer" | "custom-headers";

export const isValidHeaderKey = (key: string): boolean => {
  if (!key.trim()) {
    return false;
  }
  return MCP_VALIDATION.HEADER_NAME_REGEX.test(key);
};

// Real-time validation (excludes duplicates and completely empty headers for better UX)
export const validateCustomHeaders = (
  headers: Record<string, string>
): string[] => {
  const errors: string[] = [];

  Object.entries(headers).forEach(([key, value]) => {
    const displayKey = getDisplayHeaderKey(key);

    // Skip validation for completely empty headers (user hasn't started filling them yet)
    if (!displayKey.trim() && !value.trim()) {
      return;
    }

    if (!displayKey.trim()) {
      errors.push(MCP_VALIDATION.ERROR_MESSAGES.EMPTY_HEADER_NAME);
    } else if (!isValidHeaderKey(displayKey)) {
      errors.push(
        `Invalid header name: "${displayKey}". ${MCP_VALIDATION.ERROR_MESSAGES.INVALID_HEADER_NAME}`
      );
    }

    if (!value.trim()) {
      errors.push(
        `Header ${displayKey.trim() ? `"${displayKey}"` : "name"} ${MCP_VALIDATION.ERROR_MESSAGES.EMPTY_HEADER_VALUE}`
      );
    }
  });

  return errors;
};

// Submission validation (includes duplicates and validates all headers)
export const validateCustomHeadersForSubmission = (
  headers: Record<string, string>
): string[] => {
  const errors: string[] = [];

  const nonEmptyHeadersWithCleanKeys: Array<{
    displayKey: string;
    value: string;
  }> = [];
  Object.entries(headers).forEach(([key, value]) => {
    const displayKey = getDisplayHeaderKey(key);
    if (displayKey.trim() || value.trim()) {
      nonEmptyHeadersWithCleanKeys.push({ displayKey, value });
    }
  });

  if (nonEmptyHeadersWithCleanKeys.length === 0) {
    errors.push("At least one custom header is required.");
    return errors;
  }

  // Check for duplicate keys BEFORE consolidation (case-insensitive)
  const lowerCaseDisplayKeys = nonEmptyHeadersWithCleanKeys.map((h) =>
    h.displayKey.toLowerCase()
  );
  const uniqueKeys = new Set(lowerCaseDisplayKeys);
  if (lowerCaseDisplayKeys.length !== uniqueKeys.size) {
    errors.push(MCP_VALIDATION.ERROR_MESSAGES.DUPLICATE_HEADERS);
  }

  // Create a filtered headers object with only non-empty headers for validation
  const filteredHeaders: Record<string, string> = {};
  nonEmptyHeadersWithCleanKeys.forEach(({ displayKey, value }) => {
    filteredHeaders[displayKey] = value;
  });

  const validationErrors = validateCustomHeaders(filteredHeaders);
  errors.push(...validationErrors);

  return errors;
};

export const updateHeaderKey = (
  headers: Record<string, string>,
  oldKey: string,
  newKey: string
): Record<string, string> => {
  if (oldKey === newKey) {
    return headers;
  }

  const newHeaders: Record<string, string> = {};
  const value = headers[oldKey];

  // Check if newKey would create a duplicate (excluding the current key being updated)
  const existingKeys = Object.keys(headers)
    .filter((k) => k !== oldKey)
    .map((k) => getDisplayHeaderKey(k));
  let finalKey = newKey;

  // If duplicate exists, make key temporarily unique to prevent consolidation
  if (existingKeys.includes(newKey)) {
    finalKey = `${newKey}__dup_${Math.random().toString(36).slice(2, 6)}`;
  }

  // Rebuild the object in the same order, replacing oldKey with finalKey
  Object.entries(headers).forEach(([key, val]) => {
    if (key === oldKey) {
      newHeaders[finalKey] = value;
    } else {
      newHeaders[key] = val;
    }
  });

  return newHeaders;
};

// Helper function to get the display key (removes temporary duplicate suffixes)
export const getDisplayHeaderKey = (key: string): string => {
  return key.replace(/__dup_[a-z0-9]+$/, "");
};

export const updateHeaderValue = (
  headers: Record<string, string>,
  key: string,
  value: string
): Record<string, string> => ({
  ...headers,
  [key]: value,
});

export const removeHeader = (
  headers: Record<string, string>,
  keyToRemove: string
): Record<string, string> => {
  const newHeaders = { ...headers };
  delete newHeaders[keyToRemove];
  return newHeaders;
};

export const addNewHeader = (
  headers: Record<string, string>
): Record<string, string> => {
  return {
    ...headers,
    [""]: "",
  };
};
