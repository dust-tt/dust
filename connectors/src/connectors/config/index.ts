export class EnvironmentConfig {
  private static cache: Record<string, string> = {};

  static getEnvVariable(key: string): string {
    const cachedValue = this.cache[key];

    if (!cachedValue) {
      const value = process.env[key];
      if (value === undefined) {
        throw new Error(`${key} is required but not set`);
      }
      this.cache[key] = value;

      return value;
    }

    return cachedValue;
  }
}
