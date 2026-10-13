import type { StorageService } from "@extension/shared/services/storage";

export class ExcelStorageService implements StorageService {
  async get<T>(): Promise<T | undefined> {
    return undefined;
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}

  async clear(): Promise<void> {}

  onChanged(): () => void {
    return () => {};
  }
}
