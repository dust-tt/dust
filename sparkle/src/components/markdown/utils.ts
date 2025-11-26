export function sanitizeContent(str: string): string {
  // (1) Add closing backticks if they are missing such that we render a code block or inline
  // element during streaming.

  // Regular expression to find either a single backtick or triple backticks
  const regex = /(`{1,3})/g;
  let singleBackticks = 0;
  let tripleBackticks = 0;

  // Search for all backticks in the string and update counts
  let match;
  while ((match = regex.exec(str)) !== null) {
    if (match[1] === "```") {
      tripleBackticks++;
    } else if (match[1] === "`") {
      singleBackticks++;
    }
  }
  // Append closing backticks if needed
  if (tripleBackticks % 2 !== 0) {
    if (str.endsWith("`")) {
      str += "``";
    } else if (str.endsWith("``")) {
      str += "`";
    } else {
      str += str.includes("\n") ? "\n```" : "```";
    }
  } else if (singleBackticks % 2 !== 0) {
    str += "`";
  }

  return str;
}

export function detectLanguage(children: React.ReactNode) {
  if (Array.isArray(children) && children[0]) {
    return children[0].props.className?.replace("language-", "") || "text";
  }

  return "text";
}

/**
 * Preprocesses content to escape dollar signs that are likely NOT LaTeX math. This helps prevent
 * false positives when enabling single $ math rendering.
 *
 * Patterns that are escaped:
 * 1. Currency amounts: $100, $5.99, $1,000, $50k, $2.5M, $1 billion
 * 2. Shell/code variables: $HOME, $PATH, ${variable}
 * 3. Price ranges: "$50 to $100", "$5-$10"
 */
export function preprocessDollarSigns(content: string): string {
  let processed = content;

  // 1. Protect currency patterns
  // Matches: $100, $5.99, $1,000.50, $50k, $2.5M, $1 billion, etc.
  processed = processed.replace(
    /\$(\d+(?:,\d{3})*(?:\.\d{1,2})?(?:\s*(?:USD|EUR|CAD|GBP|million|billion|thousand|[kKmMbB]))?)\b/g,
    '\\$$$1'
  );

  // 2. Protect shell/code variables
  // Matches: $HOME, $PATH, $USER, ${variable}, ${foo.bar}
  processed = processed.replace(
    /\$([A-Z_][A-Z0-9_]*)\b/g,
    '\\$$$1'
  );

  processed = processed.replace(
    /\$\{([^}]+)\}/g,
    '\\${$1}'
  );

  return processed;
}
