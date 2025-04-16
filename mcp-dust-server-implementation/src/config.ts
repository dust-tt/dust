// src/config.ts
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Application configuration
 */
export const config = {
  /**
   * MCP server configuration
   */
  mcp: {
    /**
     * Server name
     */
    name: process.env.MCP_SERVER_NAME || 'Dust MCP Server',
    
    /**
     * Server host
     */
    host: process.env.MCP_SERVER_HOST || '0.0.0.0',
    
    /**
     * Server port
     */
    port: parseInt(process.env.MCP_SERVER_PORT || '3000', 10),
    
    /**
     * Request timeout in seconds
     */
    timeout: parseInt(process.env.MCP_REQUEST_TIMEOUT || '30', 10),
  },
  
  /**
   * Dust API configuration
   */
  dust: {
    /**
     * Dust API key
     */
    apiKey: process.env.DUST_API_KEY || '',
    
    /**
     * Dust workspace ID
     */
    workspaceId: process.env.DUST_WORKSPACE_ID || '',
    
    /**
     * Dust agent ID
     */
    agentId: process.env.DUST_AGENT_ID || '',
    
    /**
     * Dust username
     */
    username: process.env.DUST_USERNAME || 'mcp-server',
    
    /**
     * Dust email
     */
    email: process.env.DUST_EMAIL || 'mcp-server@example.com',
    
    /**
     * Dust full name
     */
    fullName: process.env.DUST_FULL_NAME || 'MCP Server',
    
    /**
     * Dust timezone
     */
    timezone: process.env.DUST_TIMEZONE || 'UTC',
  },
  
  /**
   * CORS configuration
   */
  cors: {
    /**
     * Allowed origins
     */
    allowedOrigins: process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',')
      : ['*'],
  },
  
  /**
   * Security configuration
   */
  security: {
    /**
     * Secret key for token generation
     */
    secretKey: process.env.SECURITY_SECRET_KEY || 'secret-key',
    
    /**
     * Token expiration in seconds
     */
    tokenExpiration: parseInt(process.env.SECURITY_TOKEN_EXPIRATION || '3600', 10),
  },
  
  /**
   * Logging configuration
   */
  logging: {
    /**
     * Log level
     */
    level: process.env.LOG_LEVEL || 'info',
    
    /**
     * Log format
     */
    format: process.env.LOG_FORMAT || 'json',
    
    /**
     * Whether to log request body
     */
    logRequestBody: process.env.LOG_REQUEST_BODY === 'true',
    
    /**
     * Whether to log request headers
     */
    logRequestHeaders: process.env.LOG_REQUEST_HEADERS === 'true',
    
    /**
     * Whether to log response body
     */
    logResponseBody: process.env.LOG_RESPONSE_BODY === 'true',
    
    /**
     * Whether to log response headers
     */
    logResponseHeaders: process.env.LOG_RESPONSE_HEADERS === 'true',
  },
};

export default config;
