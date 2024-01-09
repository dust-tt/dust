// TODO(2024-01-10 flav) Move all environment variables to this pattern.
interface AppConfig {
  NANGO_NOTION_CONNECTOR_ID: string;
}

function buildConfig(): AppConfig {
  const requiredEnvVars: (keyof AppConfig)[] = ["NANGO_NOTION_CONNECTOR_ID"];

  return requiredEnvVars.reduce((config, varName) => {
    const value = process.env[varName];
    if (value === undefined) {
      throw new Error(`Missing environment variable: ${varName}`);
    }
    return { ...config, [varName]: value };
  }, {} as AppConfig);
}

const cachedConfig: AppConfig = buildConfig();

export { cachedConfig };
