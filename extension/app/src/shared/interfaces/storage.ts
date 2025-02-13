export interface StorageService {
  get<T>(key: string | string[]): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
