import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Define configuration interface
interface Config {
  dust: {
    apiKey: string;
    workspaceId: string;
    agentId: string;
    username: string;
    email: string;
    fullName: string;
    timezone: string;
  };
  mcp: {
    name: string;
    host: string;
    port: number;
    timeout: number;
  };
  logging: {
    level: string;
    format: string;
  };
  cors: {
    allowedOrigins: string[];
  };
  security: {
    secretKey: string;
    tokenTTL: number;
    sessionTTL: number;
  };
}

// Load configuration from environment variables
export const config: Config = {
  dust: {
    apiKey: process.env.DUST_API_KEY || '',
    workspaceId: process.env.DUST_WORKSPACE_ID || '',
    agentId: process.env.DUST_AGENT_ID || '',
    username: process.env.DUST_USERNAME || '',
    email: process.env.DUST_EMAIL || '',
    fullName: process.env.DUST_FULL_NAME || '',
    timezone: process.env.DUST_TIMEZONE || 'UTC',
  },
  mcp: {
    name: process.env.MCP_SERVER_NAME || 'MCP Dust Server',
    host: process.env.MCP_SERVER_HOST || 'localhost',
    port: parseInt(process.env.MCP_SERVER_PORT || '5001', 10),
    timeout: parseInt(process.env.MCP_SERVER_TIMEOUT || '120', 10),
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },
  cors: {
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:3000')
      .split(',')
      .map(origin => origin.trim()),
  },
  security: {
    secretKey: process.env.SECRET_KEY || 'mcp-dust-server-secret-key',
    tokenTTL: parseInt(process.env.TOKEN_TTL || '86400000', 10), // 24 hours in milliseconds
    sessionTTL: parseInt(process.env.SESSION_TTL || '3600000', 10), // 1 hour in milliseconds
  },
};

// Validate required configuration
const validateConfig = () => {
  const requiredEnvVars = [
    'DUST_API_KEY',
    'DUST_WORKSPACE_ID',
  ];

  const missingEnvVars = requiredEnvVars.filter(envVar => !process.env[envVar]);

  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }
};

// Validate configuration on import
try {
  validateConfig();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exit(1);
}

export default config;
