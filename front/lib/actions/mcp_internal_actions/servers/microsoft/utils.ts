import type { Client } from "@microsoft/microsoft-graph-client";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import AdmZip from "adm-zip";
import { XMLParser, XMLValidator } from "fast-xml-parser";

import { normalizeError } from "@app/types/shared/utils/error_utils";

export async function getGraphClient(
  authInfo?: AuthInfo
): Promise<Client | null> {
  const accessToken = authInfo?.token;
  if (!accessToken) {
    return null;
  }

  return GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });
}

/**
 * Validates XML content for security vulnerabilities (XXE, entity expansion attacks)
 * @param xml The XML string to validate
 * @returns Result with validated XML or error
 */
export function validateDocumentXml(xml: string): {
  isValid: boolean;
  error?: string;
} {
  // Check size limits first (10MB)
  if (xml.length > 10 * 1024 * 1024) {
    return {
      isValid: false,
      error: "XML content exceeds maximum allowed size (10MB)",
    };
  }

  // Check for XXE attack vectors - external entity declarations
  const xxePatterns = [
    /<!ENTITY[^>]+SYSTEM/i, // External SYSTEM entities
    /<!ENTITY[^>]+PUBLIC/i, // External PUBLIC entities
    /<!DOCTYPE[^>]+\[/i, // DOCTYPE with internal subset (entity declarations)
  ];

  for (const pattern of xxePatterns) {
    if (pattern.test(xml)) {
      return {
        isValid: false,
        error:
          "XML contains potentially malicious entity declarations (XXE attack vector)",
      };
    }
  }

  // Check for entity expansion attacks (XML bombs)
  const entityReferencePattern = /&[a-zA-Z0-9_-]+;/g;
  const entityMatches = xml.match(entityReferencePattern);
  if (entityMatches && entityMatches.length > 1000) {
    return {
      isValid: false,
      error: "XML contains excessive entity references (potential XML bomb)",
    };
  }

  // Validate XML well-formedness using fast-xml-parser
  const validationResult = XMLValidator.validate(xml, {
    allowBooleanAttributes: true,
  });

  if (validationResult !== true) {
    return {
      isValid: false,
      error: `Invalid XML structure: ${validationResult.err.msg} at line ${validationResult.err.line}`,
    };
  }

  // Parse to ensure it's safe (parser will throw on malicious content)
  try {
    new XMLParser({
      ignoreAttributes: false,
      processEntities: false,
    }).parse(xml);
  } catch (error) {
    return {
      isValid: false,
      error: `Failed to parse XML: ${normalizeError(error).message}`,
    };
  }

  return { isValid: true };
}

/**
 * Validates ZIP file to prevent zip bomb attacks
 * @param buffer The ZIP file buffer
 * @returns Result with validation status
 */
export function validateZipFile(buffer: Buffer): {
  isValid: boolean;
  zip?: AdmZip;
  error?: string;
} {
  const MAX_COMPRESSED_SIZE = 50 * 1024 * 1024; // 50MB compressed
  const MAX_UNCOMPRESSED_SIZE = 200 * 1024 * 1024; // 200MB uncompressed
  const MAX_COMPRESSION_RATIO = 100; // Max 100:1 compression ratio
  const MAX_FILES = 10000; // Maximum number of files in archive

  // Check compressed size
  if (buffer.length > MAX_COMPRESSED_SIZE) {
    return {
      isValid: false,
      error: `ZIP file exceeds maximum compressed size (${MAX_COMPRESSED_SIZE / 1024 / 1024}MB)`,
    };
  }

  let zip: AdmZip;
  try {
    zip = new AdmZip(buffer);
  } catch (error) {
    return {
      isValid: false,
      error: `Invalid ZIP file: ${normalizeError(error).message}`,
    };
  }

  const entries = zip.getEntries();

  // Check number of files
  if (entries.length > MAX_FILES) {
    return {
      isValid: false,
      error: `ZIP file contains too many files (${entries.length} > ${MAX_FILES})`,
    };
  }

  let totalUncompressedSize = 0;

  for (const entry of entries) {
    // Skip directories
    if (entry.isDirectory) {
      continue;
    }

    const uncompressedSize = entry.header.size;
    const compressedSize = entry.header.compressedSize;

    totalUncompressedSize += uncompressedSize;

    // Check individual file size
    if (uncompressedSize > MAX_UNCOMPRESSED_SIZE) {
      return {
        isValid: false,
        error: `File '${entry.entryName}' exceeds maximum uncompressed size`,
      };
    }

    // Check compression ratio to detect zip bombs
    if (compressedSize > 0) {
      const ratio = uncompressedSize / compressedSize;
      if (ratio > MAX_COMPRESSION_RATIO) {
        return {
          isValid: false,
          error: `File '${entry.entryName}' has suspicious compression ratio (${ratio.toFixed(2)}:1), possible zip bomb`,
        };
      }
    }

    // Check for path traversal attempts
    const normalizedPath = entry.entryName.replace(/\\/g, "/");
    if (
      normalizedPath.includes("../") ||
      normalizedPath.startsWith("/") ||
      normalizedPath.includes(":")
    ) {
      return {
        isValid: false,
        error: `File '${entry.entryName}' contains suspicious path (possible path traversal attack)`,
      };
    }
  }

  // Check total uncompressed size
  if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
    return {
      isValid: false,
      error: `Total uncompressed size exceeds maximum (${MAX_UNCOMPRESSED_SIZE / 1024 / 1024}MB)`,
    };
  }

  return { isValid: true, zip };
}

/**
 * Extracts text from a .docx file by unzipping it and parsing document.xml
 */
export function extractTextFromDocx(buffer: Buffer): string {
  // Validate ZIP file to prevent zip bomb attacks
  const zipValidation = validateZipFile(buffer);
  if (!zipValidation.isValid) {
    throw new Error(
      `Invalid or potentially malicious ZIP file: ${zipValidation.error}`
    );
  }

  try {
    const zip = zipValidation.zip as AdmZip;
    const documentXml = zip.readAsText("word/document.xml");

    if (!documentXml) {
      throw new Error("document.xml not found in .docx file");
    }
    return documentXml;
  } catch (error) {
    throw new Error(
      `Failed to extract text from docx: ${normalizeError(error).message}`
    );
  }
}
