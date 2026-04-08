import { blake3 } from "@napi-rs/blake-hash";
import { v4 as uuidv4 } from "uuid";

/**
 * Generates 10-character long model SId from [A-Za-z0-9] characters.
 */
export function generateRandomModelSId(prefix?: string): string {
  const u = uuidv4();
  const b = blake3(u).subarray(0, 10);
  const sId = b.map(uniformByteToCode62).map(alphanumFromCode62).toString();

  if (prefix) {
    return `${prefix}_${sId}`;
  }

  return sId;
}

/**
 * Generates a long, secure, non-guessable secret composed of
 * URL-safe alphanumeric characters.
 *
 * length: number of characters to return (default 64).
 */
export function generateSecureSecret(length = 64): string {
  // blake3 produces 32 bytes per call. To support lengths > 32, we hash multiple
  // fresh UUIDs and concatenate the results before slicing to the desired length.
  const BLAKE3_OUTPUT_BYTES = 32;
  const chunksNeeded = Math.ceil(length / BLAKE3_OUTPUT_BYTES);
  const digest = Buffer.concat(
    Array.from({ length: chunksNeeded }, () => blake3(uuidv4()))
  ).subarray(0, length);
  return digest.map(uniformByteToCode62).map(alphanumFromCode62).toString();
}

/**
 * Given a code in between 0 and 61 included, returns the corresponding
 * character from [A-Za-z0-9]
 */
function alphanumFromCode62(code: number) {
  const CHAR_A = 65;
  const CHAR_a = 97;
  const CHAR_0 = 48;

  if (code < 26) {
    return CHAR_A + code;
  }

  if (code < 52) {
    return CHAR_a + code - 26;
  }

  if (code < 62) {
    return CHAR_0 + code - 52;
  }

  throw new Error("Invalid code");
}

/**
 * Given a byte, returns a code in between 0 and 61 included with a uniform
 * distribution guarantee, i.e. if the byte is uniformly drawn over 0-255, the
 * code will be uniformly drawn over 0-61.
 *
 * This is achieved by taking a modulo of 64 instead of 62, so the modulo is unbiased.
 * Then, if the result is 62 or 63, we draw a random number in [0, 61].
 */
function uniformByteToCode62(byte: number): number {
  const res = byte % 64;
  return res < 62 ? res : Math.floor(Math.random() * 62);
}
