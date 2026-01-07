import { stat } from "node:fs/promises";
import { isErrnoException } from "./errors";

async function statPath(path: string): Promise<Awaited<ReturnType<typeof stat>> | null> {
  try {
    return await stat(path);
  } catch (error) {
    if (isErrnoException(error) && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function fileExists(path: string): Promise<boolean> {
  const info = await statPath(path);
  return info ? info.isFile() : false;
}

export async function directoryExists(path: string): Promise<boolean> {
  const info = await statPath(path);
  return info ? info.isDirectory() : false;
}
