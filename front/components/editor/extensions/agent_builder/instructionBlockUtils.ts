/**
 * Tag name pattern (XML-like, simplified): start with letter/_ then [A-Za-z0-9._:-]*
 */
export const TAG_NAME_PATTERN = "[A-Za-z_][A-Za-z0-9._:-]*";

/**
 * Regex pattern for matching opening/closing XML tags (including empty <> when typing).
 */
export const OPENING_TAG_REGEX = new RegExp(`<(${TAG_NAME_PATTERN})?>$`);
export const CLOSING_TAG_REGEX = new RegExp(`^</(${TAG_NAME_PATTERN})?>$`);
