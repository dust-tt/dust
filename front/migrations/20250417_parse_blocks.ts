import fs from "fs";

import { makeScript } from "@app/scripts/helpers";

interface InputBlock {
  appId: string;
  spec: {
    method: string;
    url: string;
    headers_code: string;
    body_code: string;
    scheme: string;
  };
  workspaceId: string;
}

interface OutputBlock {
  appId: string;
  scheme: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
  workspaceId: string;
}

/**
 * Converts an InputBlock to an OutputBlock by extracting headers and body
 * @param block The input block to process
 * @returns An OutputBlock with extracted data
 */
function parseBlock(block: InputBlock): OutputBlock {
  // Extract headers from headers_code
  const headersMatch = block.spec.headers_code.match(/return\s+({[^;]+});/);
  const headers: Record<string, string> = {};

  if (headersMatch && headersMatch[1]) {
    const headerStr = headersMatch[1].trim();
    // Remove the curly braces
    const headerContent = headerStr.slice(1, -1).trim();

    if (headerContent) {
      // Split by commas not inside quotes
      const keyValuePairs = headerContent.split(
        /,(?=\s*"[^"]*"\s*:)|,(?=\s*[^,"]*\s*:)/
      );

      keyValuePairs.forEach((pair) => {
        // Split each pair by the first colon
        const colonIndex = pair.indexOf(":");
        if (colonIndex !== -1) {
          let key = pair.substring(0, colonIndex).trim();
          let value = pair.substring(colonIndex + 1).trim();

          // Remove quotes from key if present
          key = key.replace(/^"|"$/g, "");

          // Remove quotes from value if it's a string
          if (value.startsWith('"') && value.endsWith('"')) {
            value = value.slice(1, -1);
          }

          headers[key] = value;
        }
      });
    }
  }

  // Extract body from body_code
  let body = "";

  // More robust approach to extract the body content
  // This handles multi-line content and comments
  const bodyCodeLines = block.spec.body_code.split("\n");
  let returnStatementFound = false;
  const returnContent = [];
  let openBrackets = 0;
  let closeBrackets = 0;

  for (const line of bodyCodeLines) {
    // Skip lines that are just comments
    if (line.trim().startsWith("//") && !returnStatementFound) {
      continue;
    }

    // Look for the return statement
    if (line.includes("return") && !returnStatementFound) {
      returnStatementFound = true;
      // Extract content after 'return'
      const afterReturn = line
        .substring(line.indexOf("return") + "return".length)
        .trim();
      if (afterReturn) {
        returnContent.push(afterReturn);
      }

      // Count brackets to track nested objects/arrays
      openBrackets +=
        (afterReturn.match(/\{/g) || []).length +
        (afterReturn.match(/\(/g) || []).length;
      closeBrackets +=
        (afterReturn.match(/}/g) || []).length +
        (afterReturn.match(/\)/g) || []).length;

      // If the return statement ends with a semicolon and brackets are balanced, we're done
      if (afterReturn.endsWith(";") && openBrackets === closeBrackets) {
        break;
      }
    }
    // Continue collecting lines after return statement is found
    else if (returnStatementFound) {
      // Skip comments in multi-line return statements
      if (line.trim().startsWith("//")) {
        continue;
      }

      returnContent.push(line.trim());

      // Count brackets to track nested objects/arrays
      openBrackets +=
        (line.match(/\{/g) || []).length + (line.match(/\(/g) || []).length;
      closeBrackets +=
        (line.match(/\}/g) || []).length + (line.match(/\)/g) || []).length;

      // If this line ends with a semicolon and brackets are balanced, we're done
      if (line.trim().endsWith(";") && openBrackets === closeBrackets) {
        break;
      }
    }
  }

  if (returnContent.length > 0) {
    // Join the lines and remove the trailing semicolon
    body = returnContent.join(" ").replace(/;\s*$/, "").trim();

    // Remove JSON.stringify wrapper if present
    if (body.startsWith("JSON.stringify(") && body.endsWith(")")) {
      // Extract the content inside JSON.stringify()
      body = body.substring("JSON.stringify(".length, body.length - 1).trim();
    }
  }

  return {
    appId: block.appId,
    scheme: block.spec.scheme,
    method: block.spec.method,
    url: block.spec.url,
    headers,
    body,
    workspaceId: block.workspaceId,
  };
}

makeScript(
  {
    filePath: {
      type: "string",
      required: true,
    },
  },
  async ({ filePath }) => {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    // Read and parse the file content
    const fileContent = fs.readFileSync(filePath, "utf8");

    const data: InputBlock[] = JSON.parse(fileContent);

    // Validate that the data is an array
    if (!Array.isArray(data)) {
      throw new Error("File content is not an array of input blocks");
    }

    const parsedData = data.map((block) => parseBlock(block));

    console.log("[");
    parsedData.forEach((block, index) => {
      const jsonString = JSON.stringify(block, undefined, 2);
      const line = jsonString + (index < parsedData.length - 1 ? "," : "");
      console.log(line);
    });
    console.log("]");
  }
);
