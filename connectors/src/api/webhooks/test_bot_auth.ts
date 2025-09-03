import { BotFrameworkAdapter } from "botbuilder";
import type { Request, Response } from "express";
import logger from "@connectors/logger/logger";

/**
 * Simple test endpoint to verify Bot Framework authentication
 */
export async function testBotAuthWebhook(req: Request, res: Response) {
  try {
    logger.info("Testing Bot Framework authentication...");
    
    // Create a minimal adapter
    const testAdapter = new BotFrameworkAdapter({
      appId: process.env.BOT_ID,
      appPassword: process.env.BOT_PASSWORD,
    });

    // Simple error handler
    testAdapter.onTurnError = async (context, error) => {
      logger.error({ 
        error: error.message,
        type: error.constructor.name,
        botId: process.env.BOT_ID?.substring(0, 8) + "...",
        hasPassword: !!process.env.BOT_PASSWORD,
      }, "Bot auth test failed");
      
      await context.sendActivity("🔧 Bot authentication test failed");
    };

    // Process the request
    await testAdapter.processActivity(req, res, async (context) => {
      logger.info("✅ Bot authentication successful!");
      await context.sendActivity("✅ Bot authentication test passed!");
    });

  } catch (error) {
    logger.error({ 
      error: error.message,
      botId: process.env.BOT_ID?.substring(0, 8) + "...",
      hasPassword: !!process.env.BOT_PASSWORD,
    }, "Bot auth test error");
    
    res.status(500).json({ 
      error: "Bot authentication failed", 
      message: error.message 
    });
  }
}