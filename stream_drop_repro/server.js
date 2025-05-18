#!/usr/bin/env node

/**
 * Server component for reproducing event stream dropping issue
 * 
 * This script:
 * 1. Sets up a Redis publisher that emits events in similar patterns to the real system
 * 2. Creates an Express server with an SSE endpoint to stream events
 * 3. Handles connections to Redis and streams events to clients
 */

const express = require('express');
const cors = require('cors');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

// Configuration
const PORT = 3333;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Set up Redis clients - one for publishing, one for subscribing
const redisPublisher = new Redis(REDIS_URL);
const redisSubscriber = new Redis(REDIS_URL);

// Set up Express app
const app = express();
app.use(cors());

// Track active connections for cleanup
const clients = new Map();

// Helper: Create a sequence of events similar to what the agent would emit
async function generateMockEvents(channelId) {
  console.log(`[Publisher] Generating mock events for channel: ${channelId}`);
  
  // Sequence of events to publish, with timing
  const events = [
    {
      // First user message
      data: {
        type: 'user_message',
        text: 'Tell me about streaming issues',
      },
      delay: 100
    },
    {
      // Agent starts thinking
      data: {
        type: 'generation_tokens',
        text: '<thinking',  // First part of the delimiter tag
        classification: 'delimiter',
        eventId: `evt_${uuidv4()}`,
        created: Date.now()
      },
      delay: 0  // Immediate, same timestamp
    },
    {
      // Rest of the delimiter tag + start of thinking content
      // This is the event that often gets dropped
      data: {
        type: 'generation_tokens',
        text: '> Let me research this...',
        classification: 'chain_of_thought',
        eventId: `evt_${uuidv4()}`,
        created: Date.now()  // Same timestamp as previous event
      },
      delay: 1  // Nearly immediate, forces events with nearly identical timestamp
    },
    {
      // More thinking content
      data: {
        type: 'generation_tokens',
        text: ' I should check how the streaming protocol works.',
        classification: 'chain_of_thought',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 50
      },
      delay: 50
    },
    {
      // End thinking
      data: {
        type: 'generation_tokens',
        text: '</thinking>',
        classification: 'delimiter',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 100
      },
      delay: 100
    },
    {
      // Start of response
      data: {
        type: 'generation_tokens',
        text: '<response',
        classification: 'delimiter',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 150
      },
      delay: 0  // Another immediate event
    },
    {
      // Rest of response tag + start of content
      // This is another event that might get dropped
      data: {
        type: 'generation_tokens',
        text: '> Streaming issues typically occur',
        classification: 'tokens',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 150  // Same timestamp as previous
      },
      delay: 1  // Nearly immediate
    },
    {
      // More content
      data: {
        type: 'generation_tokens',
        text: ' due to several factors...',
        classification: 'tokens',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 200
      },
      delay: 200
    },
    {
      // Success message
      data: {
        type: 'agent_message_success',
        eventId: `evt_${uuidv4()}`,
        created: Date.now() + 300
      },
      delay: 300
    }
  ];

  // Publish the events with specified delays
  for (const event of events) {
    // Tag the event with server-side publication info
    const eventWithMetadata = {
      ...event.data,
      _publishTime: Date.now(),
      _metadata: {
        channel: channelId,
        index: events.indexOf(event)
      }
    };
    
    // Publish to Redis
    await new Promise(resolve => {
      setTimeout(() => {
        const serialized = JSON.stringify({
          eventId: eventWithMetadata.eventId || `evt_${uuidv4()}`,
          data: eventWithMetadata
        });
        
        console.log(`[Publisher] Publishing event: ${eventWithMetadata.type}${
          eventWithMetadata.text ? ` with text: "${eventWithMetadata.text}"` : ''
        }`);
        
        redisPublisher.publish(channelId, serialized);
        resolve();
      }, event.delay);
    });
  }
  
  console.log(`[Publisher] Finished publishing all events to channel: ${channelId}`);
}

// SSE endpoint
app.get('/api/v1/events/:channelId', async (req, res) => {
  const channelId = req.params.channelId;
  const lastEventId = req.headers['last-event-id'] || req.query.lastEventId;
  
  console.log(`[Server] New client connected to channel ${channelId}${
    lastEventId ? ` with lastEventId: ${lastEventId}` : ''
  }`);
  
  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  
  // Helper to send SSE events
  const sendEvent = (event) => {
    const eventData = JSON.stringify(event);
    res.write(`data: ${eventData}\n\n`);
  };
  
  // Set up connection closure monitoring
  const clientId = uuidv4();
  clients.set(clientId, { res, channelId });
  
  req.on('close', () => {
    console.log(`[Server] Client ${clientId} disconnected from channel ${channelId}`);
    if (clients.has(clientId)) {
      redisSubscriber.unsubscribe(channelId);
      clients.delete(clientId);
    }
  });
  
  // Subscribe to Redis channel
  await redisSubscriber.subscribe(channelId);
  
  // Handle messages from Redis
  const messageHandler = (channel, message) => {
    if (channel !== channelId) return;
    
    try {
      const parsedMessage = JSON.parse(message);
      sendEvent(parsedMessage);
      console.log(`[Server] Sent event to client ${clientId}: ${
        parsedMessage.data.type
      }${
        parsedMessage.data.text ? ` with text: "${parsedMessage.data.text}"` : ''
      }`);
    } catch (err) {
      console.error(`[Server] Error processing message: ${err.message}`);
    }
  };
  
  redisSubscriber.on('message', messageHandler);
});

// Trigger endpoint - starts the event generation for a channel
app.post('/api/v1/trigger/:channelId', (req, res) => {
  const channelId = req.params.channelId;
  generateMockEvents(channelId);
  res.status(200).json({ status: 'ok', message: `Started event generation for channel: ${channelId}` });
});

// Create a new channel ID
app.post('/api/v1/channels', (req, res) => {
  const channelId = `channel_${uuidv4()}`;
  res.status(200).json({ status: 'ok', channelId });
});

// Start the server
app.listen(PORT, () => {
  console.log(`[Server] Stream drop reproduction server running on port ${PORT}`);
  console.log(`[Server] Using Redis at ${REDIS_URL}`);
  console.log(`[Server] Ready to receive connections.`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('[Server] Shutting down...');
  redisPublisher.quit();
  redisSubscriber.quit();
  process.exit(0);
});