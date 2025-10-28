import { hash as blake3 } from "blake3";
import { v4 as uuidv4 } from "uuid";

// OpenAI requires a unique id for each tool call output sent to the responses api
// Code inspired by core
export function generateFunctionCallId(): string {
  const uuid = uuidv4();
  const hasher = blake3(uuid);
  const hexString = Buffer.from(hasher).toString("hex");
  return `fc_${hexString.slice(0, 9)}`;
}
