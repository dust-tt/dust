// src/utils/http-stream-transport.ts
import { Response } from 'express';
import { logger } from './logger';

/**
 * HTTP Stream Transport for MCP server
 * Implements a transport that uses HTTP streaming for communication
 */
export class HTTPStreamTransport {
  private res: Response;
  private sessionId: string;
  private path: string;
  private messageHandler: ((message: any) => Promise<void>) | null = null;

  /**
   * Create a new HTTP Stream transport
   * @param path The path for the transport
   * @param res The Express response object
   * @param sessionId The session ID for the transport
   */
  constructor(path: string, res: Response, sessionId: string) {
    this.path = path;
    this.res = res;
    this.sessionId = sessionId;
    
    logger.debug(`HTTP Stream transport created for session ${sessionId}`);
  }

  /**
   * Set the message handler for the transport
   * @param handler The message handler function
   */
  setMessageHandler(handler: (message: any) => Promise<void>): void {
    this.messageHandler = handler;
  }

  /**
   * Send a message through the transport
   * @param message The message to send
   */
  async send(message: any): Promise<void> {
    try {
      if (!this.res.headersSent) {
        this.res.setHeader('Content-Type', 'application/json');
      }
      
      this.res.status(200).json(message);
      logger.debug(`HTTP Stream message sent: ${JSON.stringify(message)}`);
    } catch (error) {
      logger.error(`Error sending HTTP Stream message: ${error}`);
      throw error;
    }
  }

  /**
   * Process a message received through the transport
   * @param message The message to process
   */
  async processMessage(message: any): Promise<void> {
    try {
      if (this.messageHandler) {
        await this.messageHandler(message);
      } else {
        logger.warn(`No message handler registered for HTTP Stream transport (session ${this.sessionId})`);
      }
    } catch (error) {
      logger.error(`Error processing HTTP Stream message: ${error}`);
      throw error;
    }
  }

  /**
   * Close the transport
   */
  close(): void {
    try {
      if (!this.res.headersSent) {
        this.res.status(200).json({ status: 'closed' });
      }
      
      logger.debug(`HTTP Stream transport closed for session ${this.sessionId}`);
    } catch (error) {
      logger.error(`Error closing HTTP Stream transport: ${error}`);
    }
  }
}
