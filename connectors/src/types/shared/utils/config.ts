export class EnvironmentConfig {
  private static cache: Record<string, string> = {};

  static getEnvVariable(key: string): string {
    const cachedValue = EnvironmentConfig.cache[key];

    if (!cachedValue) {
      const value = process.env[key];
      if (value === undefined) {
        throw new Error(`${key} is required but not set`);
      }
      EnvironmentConfig.cache[key] = value;

      return value;
    }

    return cachedValue;
  }

  static getOptionalEnvVariable(key: string): string | undefined {
    if (!EnvironmentConfig.cache[key]) {
      const value = process.env[key];
      if (value) {
        EnvironmentConfig.cache[key] = value;
      }
    }
    return EnvironmentConfig.cache[key];
  }
}
