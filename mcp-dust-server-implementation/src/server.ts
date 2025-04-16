// src/server.ts
import express from 'express';
import { createServer } from 'http';
import cors from 'cors';
import dotenv from 'dotenv';
import { json } from 'express';
import { logger, Logger } from './utils/logger';
import { config } from './config';
import { DustService } from './services/dustService';
import { MCPServer } from './types/server';
import { createAuthMiddleware } from './middleware/auth-middleware';
import {
  errorHandlerMiddleware,
  notFoundMiddleware,
  jsonRpcErrorMiddleware,
} from './middleware/error-middleware';
import { createSessionMiddleware } from './middleware/session-middleware';
import { PermissionProxy } from './services/permissionProxy';
import { UserContextService } from './services/userContextService';
import { TokenService } from './services/tokenService';
import { DustApiReflector } from './services/dustApiReflector';
import { EventBridge } from './services/eventBridge';
import { ResourceProvider } from './resources/resourceProvider';
import { createWorkspaceRoutes } from './routes/workspaceRoutes';
import { registerWorkspaceTools } from './tools/workspaceTools';
import { WorkspaceService } from './services/workspaceService';
import { createAgentRoutes } from './routes/agentRoutes';
import { registerAgentTools } from './tools/agentTools';
import { AgentService } from './services/agentService';
import { createKnowledgeBaseRoutes } from './routes/knowledgeBaseRoutes';
import { registerKnowledgeBaseTools } from './tools/knowledgeBaseTools';
import { KnowledgeBaseService } from './services/knowledgeBaseService';
import { createConnectorRoutes } from './routes/connectorRoutes';
import { registerConnectorTools } from './tools/connectorTools';
import { ConnectorService } from './services/connectorService';
import { initializeUncaughtHandlers } from './utils/uncaught-handler';
import { createRequestLoggerMiddleware } from './middleware/request-logger-middleware';
import { createRateLimitMiddleware } from './middleware/rate-limit-middleware';
import { createSecureHeadersMiddleware } from './middleware/secure-headers-middleware';
import { createCSRFMiddleware } from './middleware/csrf-middleware';
import { Security } from './utils/security';
import { SecurityAudit, SecurityEventSeverity, SecurityEventType } from './utils/security-audit';

// Load environment variables
dotenv.config();

// Initialize uncaught exception and unhandled rejection handlers
initializeUncaughtHandlers();

// Create Express app and HTTP server
const app = express();
const httpServer = createServer(app);

// Initialize Dust service with API key and workspace ID
const dustService = new DustService({
  apiKey: config.dust.apiKey,
  workspaceId: config.dust.workspaceId,
  agentId: config.dust.agentId,
  userContext: {
    username: config.dust.username,
    email: config.dust.email,
    fullName: config.dust.fullName,
    timezone: config.dust.timezone,
  },
});

// Initialize authentication services
const userContextService = new UserContextService(dustService);
const tokenService = new TokenService(config.security.secretKey);
const permissionProxy = new PermissionProxy(dustService, userContextService);

// Configure middleware
app.use(json());
app.use(
  cors({
    origin: config.cors.allowedOrigins,
    methods: ['GET', 'POST', 'OPTIONS', 'DELETE'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Dust-API-Key',
      'Mcp-Session-Id',
      'X-Request-ID',
    ],
    exposedHeaders: ['Content-Type', 'Mcp-Session-Id', 'X-Request-ID'],
  })
);

// Apply enhanced security middleware
app.use(
  createSecureHeadersMiddleware({
    enableHSTS: process.env.NODE_ENV === 'production',
    enableCSP: true,
    enableXSSProtection: true,
    enableNoSniff: true,
    enableFrameOptions: true,
    enableReferrerPolicy: true,
    enablePermissionPolicy: true,
    enableCrossOriginOpenerPolicy: true,
    enableCrossOriginEmbedderPolicy: false, // Disabled as it can break some integrations
    enableCrossOriginResourcePolicy: true,
    enableOriginAgentCluster: true,
    enableRequestId: true,
  })
);

// Apply rate limiting middleware
app.use(
  createRateLimitMiddleware({
    limit: 100, // 100 requests per hour
    windowSizeInSeconds: 60 * 60, // 1 hour
    includeHeaders: true,
    keyGenerator: req => req.ip || (req.headers['x-forwarded-for'] as string) || 'unknown',
    skip: req => req.path === '/health' || req.path === '/ready' || req.path === '/live', // Skip health check endpoints
    message: 'Too many requests, please try again later',
    statusCode: 429,
  })
);

// Apply CSRF protection middleware
app.use(
  createCSRFMiddleware({
    cookieName: 'XSRF-TOKEN',
    headerName: 'X-XSRF-TOKEN',
    tokenExpiration: 3600, // 1 hour
    secureCookies: process.env.NODE_ENV === 'production',
    sameSiteCookies: 'lax',
    protectedMethods: ['POST', 'PUT', 'PATCH', 'DELETE'],
    ignorePaths: ['/api/v1/auth/login', '/api/v1/auth/logout', '/stream', '/sse'], // Skip authentication endpoints and MCP endpoints
  })
);

// Add request logger middleware
app.use(
  createRequestLoggerMiddleware({
    logBody: config.logging.logRequestBody,
    logHeaders: config.logging.logRequestHeaders,
    logResponseBody: config.logging.logResponseBody,
    logResponseHeaders: config.logging.logResponseHeaders,
    logTiming: true,
  })
);

// Create session middleware
const sessionMiddleware = createSessionMiddleware({
  createIfMissing: true,
  extendSession: true,
  sessionHeader: 'mcp-session-id',
  sessionCookie: 'mcp_session_id',
});

// Create authentication middleware
const authMiddleware = createAuthMiddleware({
  dustService,
  requireAuth: true,
  headerName: 'x-dust-api-key',
});

// Create MCP server with Dust service
const mcpServer = new MCPServer({
  name: config.mcp.name,
  dustService,
  timeout: config.mcp.timeout * 1000, // Convert to milliseconds
});

// Initialize the API reflector
const apiReflector = new DustApiReflector(dustService, mcpServer);
apiReflector.reflectApi();

// Initialize the resource provider
const resourceProvider = new ResourceProvider({
  dustService,
  permissionProxy,
  mcpServer,
});
resourceProvider.registerResourceTemplates();

// Initialize the workspace service
const workspaceService = new WorkspaceService({
  dustService,
  permissionProxy,
});

// Register workspace tools
registerWorkspaceTools({
  workspaceService,
  mcpServer,
});

// Initialize the agent service
const agentService = new AgentService({
  dustService,
  permissionProxy,
  eventBridge: undefined, // Will be set per session
});

// Register agent tools
registerAgentTools({
  agentService,
  mcpServer,
});

// Initialize the knowledge base service
const knowledgeBaseService = new KnowledgeBaseService({
  dustService,
  permissionProxy,
  eventBridge: undefined, // Will be set per session
});

// Register knowledge base tools
registerKnowledgeBaseTools({
  knowledgeBaseService,
  mcpServer,
});

// Initialize the connector service
const connectorService = new ConnectorService({
  dustService,
  permissionProxy,
  eventBridge: undefined, // Will be set per session
});

// Register connector tools
registerConnectorTools({
  connectorService,
  mcpServer,
});

// Apply session and authentication middleware
app.use(sessionMiddleware);
app.use(authMiddleware);

// Apply error handling middleware at the end
app.use(notFoundMiddleware);
app.use(jsonRpcErrorMiddleware);
app.use(errorHandlerMiddleware);

// Set up session handling
mcpServer.on('session', session => {
  logger.info(`Client connected: ${session.id}`);

  // Set up permission proxy for this session
  session.data.permissionProxy = permissionProxy;

  // Set up user context service for this session
  session.data.userContextService = userContextService;

  // Set up token service for this session
  session.data.tokenService = tokenService;

  // Set up dust service for this session
  session.data.dustService = dustService;

  // Set up event bridge for this session
  const eventBridge = new EventBridge(dustService, mcpServer, session.id);
  session.eventBridge = eventBridge;
  session.data.eventBridge = eventBridge;

  // Set up resource provider for this session
  session.data.resourceProvider = resourceProvider;

  // Set up workspace service for this session
  session.data.workspaceService = workspaceService;

  // Set up agent service for this session with the session's event bridge
  const sessionAgentService = new AgentService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  session.data.agentService = sessionAgentService;

  // Set up knowledge base service for this session with the session's event bridge
  const sessionKnowledgeBaseService = new KnowledgeBaseService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  session.data.knowledgeBaseService = sessionKnowledgeBaseService;

  // Set up connector service for this session with the session's event bridge
  const sessionConnectorService = new ConnectorService({
    dustService,
    permissionProxy,
    eventBridge,
  });
  session.data.connectorService = sessionConnectorService;

  // Set up progress notification handler
  session.sendProgressNotification = notification => {
    // For SSE connections, send the notification as an event
    // For HTTP Stream connections, store the notification for the next request
    logger.debug(`Sending progress notification to session ${session.id}: ${notification.type}`);
  };

  // Subscribe to events
  eventBridge.subscribe(
    [
      'agent:execution:started',
      'agent:execution:progress',
      'agent:execution:completed',
      'agent:execution:failed',
    ],
    event => {
      logger.debug(`Received event for session ${session.id}: ${event.type}`);
    }
  );
});

// Set up SSE endpoint for MCP communication
app.post('/sse', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for Nginx

  // Handle client connection
  mcpServer.handleSSEConnection(req, res);

  // Get session ID from request
  const sessionId = req.mcpSessionId;

  if (sessionId) {
    // Get session
    const session = mcpServer.getSession(sessionId);

    if (session && session.eventBridge) {
      // Update session's sendProgressNotification function to send SSE events
      session.sendProgressNotification = notification => {
        // Send notification as SSE event
        res.write(`event: progress\n`);
        res.write(`data: ${JSON.stringify(notification)}\n\n`);
      };
    }
  }
});

// Set up HTTP Stream endpoint for MCP communication
app.post('/stream', (req, res) => {
  // Handle client connection
  mcpServer.handleStreamConnection(req, res);

  // Get session ID from request
  const sessionId = req.mcpSessionId;

  if (sessionId) {
    // Get session
    const session = mcpServer.getSession(sessionId);

    if (session && session.eventBridge) {
      // Store notifications in session data for the next request
      const notifications: any[] = [];

      // Update session's sendProgressNotification function to store notifications
      session.sendProgressNotification = notification => {
        // Store notification for the next request
        notifications.push(notification);

        // Store notifications in session data
        session.data.pendingNotifications = notifications;
      };

      // Check if there are pending notifications
      if (session.data.pendingNotifications && session.data.pendingNotifications.length > 0) {
        // Include pending notifications in the response
        res.json({
          type: 'progress',
          notifications: session.data.pendingNotifications,
        });

        // Clear pending notifications
        session.data.pendingNotifications = [];

        // Return early
        return;
      }
    }
  }
});

// Add health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    component: 'MCP Dust Server',
  });
});

app.get('/ready', (req, res) => {
  res.status(200).json({
    status: 'ready',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/live', (req, res) => {
  res.status(200).json({
    status: 'alive',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Add workspace routes
app.use('/api/v1/workspaces', createWorkspaceRoutes(dustService, permissionProxy));

// Add agent routes
app.use('/api/v1/workspaces/:workspaceId/agents', createAgentRoutes(dustService, permissionProxy));

// Add knowledge base routes
app.use(
  '/api/v1/workspaces/:workspaceId/knowledge-bases',
  createKnowledgeBaseRoutes(dustService, permissionProxy)
);

// Add connector routes
app.use(
  '/api/v1/workspaces/:workspaceId/connectors',
  createConnectorRoutes(dustService, permissionProxy)
);

// Add API status endpoint
app.get('/api/v1/status', (req, res) => {
  res.json({
    status: 'operational',
    version: '0.1.0',
    workspace: config.dust.workspaceId,
    agent: config.dust.agentId,
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    authenticated: req.user ? true : false,
    user: req.user
      ? {
          username: req.user.username,
          email: req.user.email,
        }
      : null,
  });
});

// Add authentication endpoints
app.post('/api/v1/auth/login', async (req, res, next) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      throw APIError.validationError('API key is required');
    }

    // Validate API key format
    if (!Security.validateApiKeyFormat(apiKey)) {
      // Log authentication failure
      SecurityAudit.logAuthenticationFailure(req, 'unknown', 'Invalid API key format');
      throw APIError.authenticationError('Invalid API key format');
    }

    // Validate API key
    const isValid = await dustService.validateApiKey();

    if (!isValid) {
      // Log authentication failure
      SecurityAudit.logAuthenticationFailure(req, 'unknown', 'Invalid API key');
      throw APIError.authenticationError('Invalid API key');
    }

    // Get user context
    const userContext = await userContextService.getUserContext(apiKey);

    // Create token with secure random ID
    const token = tokenService.createToken({
      userId: userContext.id,
      username: userContext.username,
      email: userContext.email,
      workspaceId: userContext.workspaceId,
      permissions: userContext.permissions,
      tokenId: Security.generateRandomToken(16), // Add a unique token ID
    });

    // Log authentication success
    SecurityAudit.logAuthenticationSuccess(req, userContext.id, userContext.username);

    // Log session created
    SecurityAudit.logSessionCreated(req);

    res.json({
      token,
      user: {
        id: userContext.id,
        username: userContext.username,
        email: userContext.email,
        workspaceId: userContext.workspaceId,
      },
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/refresh', (req, res, next) => {
  try {
    const { token } = req.body;

    if (!token) {
      throw APIError.validationError('Token is required');
    }

    // Verify token before refreshing
    try {
      // Verify the token without refreshing it
      const payload = Security.verifyJwtToken(token);

      // Log token refresh attempt
      SecurityAudit.logEvent({
        type: SecurityEventType.AUTHENTICATION_SUCCESS,
        severity: SecurityEventSeverity.INFO,
        message: `Token refresh attempt for user ${payload.username}`,
        userId: payload.userId,
        username: payload.username,
        sessionId: req.session?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string,
        path: req.path,
        method: req.method,
      });
    } catch (verifyError) {
      // Log failed token refresh
      SecurityAudit.logEvent({
        type: SecurityEventType.AUTHENTICATION_FAILURE,
        severity: SecurityEventSeverity.MEDIUM,
        message: `Token refresh failed: ${verifyError.message}`,
        sessionId: req.session?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] as string,
        path: req.path,
        method: req.method,
      });

      throw APIError.authenticationError('Invalid or expired token');
    }

    // Refresh token
    const newToken = tokenService.refreshToken(token);

    if (!newToken) {
      throw APIError.authenticationError('Invalid or expired token');
    }

    res.json({
      token: newToken,
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/v1/auth/logout', (req, res) => {
  // Log session invalidated
  if (req.user) {
    SecurityAudit.logSessionInvalidated(req, 'User logout');
  }

  // Clear session
  if (req.mcpSessionId) {
    mcpServer.destroySession(req.mcpSessionId);
  }

  // Clear session cookie
  res.clearCookie('mcp.sid');

  // Clear CSRF cookie
  res.clearCookie('XSRF-TOKEN');

  res.json({
    success: true,
  });
});

// Start the server
function startServer() {
  return new Promise((resolve, reject) => {
    try {
      const server = httpServer.listen(config.mcp.port, config.mcp.host, () => {
        logger.info(`MCP Server running on http://${config.mcp.host}:${config.mcp.port}`);
        logger.info(`Server name: ${config.mcp.name}`);
        logger.info(`Dust workspace: ${config.dust.workspaceId}`);
        logger.info(`Dust agent: ${config.dust.agentId}`);
        resolve(server);
      });
    } catch (error) {
      logger.error(`Failed to start server: ${error}`);
      reject(error);
    }
  });
}

// Handle graceful shutdown
function setupShutdownHandlers() {
  process.on('SIGINT', () => {
    logger.info('Received SIGINT. Shutting down gracefully...');

    // Dispose of all event bridges
    for (const session of mcpServer.getAllSessions()) {
      if (session.eventBridge) {
        logger.info(`Disposing event bridge for session ${session.id}`);
        session.eventBridge.dispose();
      }
    }

    httpServer.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM. Shutting down gracefully...');

    // Dispose of all event bridges
    for (const session of mcpServer.getAllSessions()) {
      if (session.eventBridge) {
        logger.info(`Disposing event bridge for session ${session.id}`);
        session.eventBridge.dispose();
      }
    }

    httpServer.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 5000);
  });
}

// Main function to start the server
async function main() {
  try {
    setupShutdownHandlers();
    await startServer();
  } catch (error) {
    logger.error(`Failed to start MCP server: ${error}`);
    process.exit(1);
  }
}

// Run the main function if this is the entry point
const isMainModule = import.meta.url === `file://${process.argv[1]}`;

if (isMainModule) {
  main().catch(error => {
    logger.error(`Unhandled exception: ${error}`);
    process.exit(1);
  });
}

export { app, httpServer, mcpServer, main };
