# Task 5: Implement Authentication System

## Description
Implement the authentication system for the MCP server, integrating with Dust's authentication.

## Status
TODO

## Priority
HIGH

## Dependencies
1. Set Up Project Repository
2. Configure Environment and Dependencies
3. Implement Core MCP Server Structure
4. Implement DustService Class

## Subtasks
1. Implement API key validation for Dust API
2. Create session management for MCP clients
3. Implement authentication middleware
4. Set up permission checking for operations
5. Create user context handling
6. Implement secure token storage and transmission

## Implementation Details
For this task, we need to implement the authentication system for the MCP server, integrating with Dust's authentication.

### 1. Implement API Key Validation for Dust API
Create a utility function to validate API keys:
```typescript
// src/utils/auth.ts
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    // Call Dust API to validate the API key
    const response = await fetch('https://dust.tt/api/user', {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
    });

    return response.ok;
  } catch (error) {
    logger.error(`Error validating API key: ${error.message}`);
    return false;
  }
}
```

### 2. Create Session Management for MCP Clients
Implement session management for MCP clients:
```typescript
// src/types/session.ts
export interface MCPSession {
  id: string;
  createdAt: Date;
  lastActivityAt: Date;
  user: {
    id: string;
    name: string;
    email: string;
  };
  data: Record<string, any>;
}

// src/services/sessionService.ts
export class SessionService {
  private sessions: Map<string, MCPSession> = new Map();

  createSession(user: { id: string; name: string; email: string }): MCPSession {
    const sessionId = crypto.randomUUID();
    const session: MCPSession = {
      id: sessionId,
      createdAt: new Date(),
      lastActivityAt: new Date(),
      user,
      data: {},
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): MCPSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivityAt = new Date();
    }
    return session;
  }

  deleteSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  // Clean up expired sessions
  cleanupSessions(maxAgeMs: number): void {
    const now = new Date();
    for (const [sessionId, session] of this.sessions.entries()) {
      if (now.getTime() - session.lastActivityAt.getTime() > maxAgeMs) {
        this.sessions.delete(sessionId);
      }
    }
  }
}
```

### 3. Implement Authentication Middleware
Create authentication middleware for Express:
```typescript
// src/middleware/auth.ts
export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Get API key from request headers
  const apiKey = req.headers['x-dust-api-key'] as string;
  if (!apiKey) {
    return res.status(401).json({ error: 'API key is required' });
  }

  // Validate API key
  validateApiKey(apiKey)
    .then((isValid) => {
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid API key' });
      }

      // Set user context on request
      req.user = { apiKey };
      next();
    })
    .catch((error) => {
      logger.error(`Authentication error: ${error.message}`);
      res.status(500).json({ error: 'Authentication error' });
    });
}
```

### 4. Set Up Permission Checking for Operations
Implement permission checking for operations:
```typescript
// src/utils/permissions.ts
export enum Permission {
  READ_WORKSPACE = 'read:workspace',
  WRITE_WORKSPACE = 'write:workspace',
  READ_AGENT = 'read:agent',
  EXECUTE_AGENT = 'execute:agent',
  READ_KNOWLEDGE = 'read:knowledge',
  WRITE_KNOWLEDGE = 'write:knowledge',
}

export async function checkPermission(apiKey: string, permission: Permission, resourceId: string): Promise<boolean> {
  try {
    // Call Dust API to check permission
    const response = await fetch(`https://dust.tt/api/permissions/check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        permission,
        resourceId,
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.hasPermission;
  } catch (error) {
    logger.error(`Error checking permission: ${error.message}`);
    return false;
  }
}
```

### 5. Create User Context Handling
Implement user context handling:
```typescript
// src/types/user.ts
export interface UserContext {
  id: string;
  name: string;
  email: string;
  timezone: string;
}

// src/services/userService.ts
export class UserService {
  async getUserContext(apiKey: string): Promise<UserContext> {
    try {
      // Call Dust API to get user context
      const response = await fetch('https://dust.tt/api/user', {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get user context: ${response.statusText}`);
      }

      const data = await response.json();
      return {
        id: data.id,
        name: data.name,
        email: data.email,
        timezone: data.timezone || 'UTC',
      };
    } catch (error) {
      logger.error(`Error getting user context: ${error.message}`);
      throw error;
    }
  }
}
```

### 6. Implement Secure Token Storage and Transmission
Implement secure token storage and transmission:
- Use HTTPS for all API requests
- Store API keys securely (environment variables, secrets manager)
- Implement token encryption for storage
- Use secure cookies for session tokens
- Implement CSRF protection
- Set appropriate security headers

## Test Strategy
- Verify that API key validation works correctly
- Test session management with different scenarios
- Ensure that authentication middleware correctly validates API keys
- Test permission checking with different permissions and resources
- Verify that user context is correctly retrieved and used
- Test secure token storage and transmission
