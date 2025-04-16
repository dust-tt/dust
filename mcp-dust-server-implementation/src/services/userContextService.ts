// src/services/userContextService.ts
import { logger } from '../utils/logger';
import { DustService } from './dustService';

/**
 * User context information
 */
export interface UserContext {
  id: string;
  username: string;
  email: string;
  fullName?: string;
  timezone?: string;
  workspaceId?: string;
  permissions?: string[];
}

/**
 * User context service for managing user context
 */
export class UserContextService {
  private dustService: DustService;
  private userContextCache: Map<string, UserContext>;
  private cacheTTL: number;
  
  /**
   * Create a new UserContextService
   * @param dustService DustService instance
   * @param cacheTTL Cache TTL in milliseconds (default: 5 minutes)
   */
  constructor(dustService: DustService, cacheTTL: number = 5 * 60 * 1000) {
    this.dustService = dustService;
    this.userContextCache = new Map();
    this.cacheTTL = cacheTTL;
    
    // Clean up expired cache entries periodically
    setInterval(() => this.cleanupCache(), cacheTTL);
    
    logger.info('UserContextService initialized');
  }
  
  /**
   * Get user context for an API key
   * @param apiKey API key
   * @returns User context
   */
  async getUserContext(apiKey: string): Promise<UserContext> {
    try {
      // Check cache
      const cachedContext = this.userContextCache.get(apiKey);
      if (cachedContext) {
        logger.debug(`Using cached user context for API key ${apiKey.substring(0, 4)}...`);
        return cachedContext;
      }
      
      // Get user information from Dust API
      const userInfo = await this.dustService.getUserInfo();
      
      // Create user context
      const userContext: UserContext = {
        id: userInfo.id,
        username: userInfo.username,
        email: userInfo.email,
        fullName: userInfo.fullName,
        timezone: userInfo.timezone || 'UTC',
        workspaceId: userInfo.workspaceId,
        permissions: userInfo.permissions || [],
      };
      
      // Cache user context
      this.userContextCache.set(apiKey, userContext);
      
      // Add expiration time to cache entry
      setTimeout(() => {
        this.userContextCache.delete(apiKey);
      }, this.cacheTTL);
      
      logger.debug(`Retrieved user context for ${userContext.username} (${userContext.email})`);
      
      return userContext;
    } catch (error) {
      logger.error(`Error getting user context: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create a user context
   * @param userContext User context
   * @returns API key
   */
  createUserContext(userContext: UserContext): string {
    try {
      // Generate a random API key
      const apiKey = Buffer.from(Math.random().toString(36).substring(2)).toString('base64');
      
      // Cache user context
      this.userContextCache.set(apiKey, userContext);
      
      // Add expiration time to cache entry
      setTimeout(() => {
        this.userContextCache.delete(apiKey);
      }, this.cacheTTL);
      
      logger.debug(`Created user context for ${userContext.username} (${userContext.email})`);
      
      return apiKey;
    } catch (error) {
      logger.error(`Error creating user context: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Delete a user context
   * @param apiKey API key
   */
  deleteUserContext(apiKey: string): void {
    try {
      // Delete user context from cache
      this.userContextCache.delete(apiKey);
      
      logger.debug(`Deleted user context for API key ${apiKey.substring(0, 4)}...`);
    } catch (error) {
      logger.error(`Error deleting user context: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const count = this.userContextCache.size;
    this.userContextCache.clear();
    logger.debug(`Cleaned up ${count} user context cache entries`);
  }
}
