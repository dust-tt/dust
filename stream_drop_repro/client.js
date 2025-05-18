#!/usr/bin/env node

/**
 * Client component for reproducing event stream dropping issue
 *
 * This script:
 * 1. Creates a connection to the server SSE endpoint
 * 2. Processes events using the same pattern as the Dust SDK
 * 3. Detects and logs any dropped events
 * 4. Analyzes the event sequence for issues
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { createParser } = require('eventsource-parser');
const { v4: uuidv4 } = require('uuid');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3333';
const LOG_DIR = path.join(__dirname, 'logs');
const RUN_ID = new Date().toISOString().replace(/[:.]/g, '-');
const CHUNK_LOG_FILE = path.join(LOG_DIR, `raw-chunks-${RUN_ID}.jsonl`);
const EVENTS_LOG_FILE = path.join(LOG_DIR, `events-${RUN_ID}.jsonl`);
const ANALYSIS_FILE = path.join(LOG_DIR, `analysis-${RUN_ID}.md`);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Create log files
const chunkLogStream = fs.createWriteStream(CHUNK_LOG_FILE, { flags: 'a' });
const eventsLogStream = fs.createWriteStream(EVENTS_LOG_FILE, { flags: 'a' });

// Tracking for analysis
const receivedEvents = [];
const rawChunks = [];
let chunkCounter = 0;

/**
 * Log a raw chunk from the stream
 */
function logRawChunk(chunk, pendingEventsCount) {
  const chunkBase64 = Buffer.from(chunk).toString('base64');
  const entry = {
    timestamp: new Date().toISOString(),
    chunkIndex: chunkCounter++,
    chunkSize: chunk.length,
    chunkBase64,
    pendingEventsCount
  };
  
  chunkLogStream.write(JSON.stringify(entry) + '\n');
  rawChunks.push(entry);
  
  return entry;
}

/**
 * Log a processed event
 */
function logEvent(event, chunkIndex) {
  const entry = {
    timestamp: new Date().toISOString(),
    chunkIndex,
    event
  };
  
  eventsLogStream.write(JSON.stringify(entry) + '\n');
  receivedEvents.push(entry);
  
  return entry;
}

/**
 * Create a new channel for testing
 */
async function createChannel() {
  try {
    const response = await fetch(`${SERVER_URL}/api/v1/channels`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create channel: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Created channel: ${data.channelId}`);
    return data.channelId;
  } catch (error) {
    console.error(`Error creating channel: ${error.message}`);
    throw error;
  }
}

/**
 * Trigger event generation for a channel
 */
async function triggerEvents(channelId) {
  try {
    const response = await fetch(`${SERVER_URL}/api/v1/trigger/${channelId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to trigger events: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`Triggered events for channel: ${channelId}`);
    return data;
  } catch (error) {
    console.error(`Error triggering events: ${error.message}`);
    throw error;
  }
}

/**
 * Stream events for a channel
 * This mimics the Dust SDK's streamAgentMessageEvents implementation
 */
async function streamEvents(channelId, lastEventId = null) {
  try {
    console.log(`Connecting to event stream for channel: ${channelId}${
      lastEventId ? ` from lastEventId: ${lastEventId}` : ''
    }`);
    
    // Construct URL with query parameters if needed
    let url = `${SERVER_URL}/api/v1/events/${channelId}`;
    if (lastEventId) {
      url += `?lastEventId=${encodeURIComponent(lastEventId)}`;
    }
    
    // Connect to the SSE endpoint
    const response = await fetch(url, {
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        ...(lastEventId && { 'Last-Event-ID': lastEventId })
      }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to connect to event stream: ${response.statusText}`);
    }
    
    if (!response.body) {
      throw new Error('Response body is null');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    
    // Similar to the Dust SDK implementation, using pendingEvents array
    let pendingEvents = [];
    let currentLastEventId = lastEventId;
    
    // Create SSE parser
    const parser = createParser((event) => {
      if (event.type === 'event') {
        if (event.data) {
          try {
            const eventData = JSON.parse(event.data);
            if (eventData.eventId) {
              currentLastEventId = eventData.eventId;
            }
            pendingEvents.push(eventData.data);
          } catch (err) {
            console.error(`Failed parsing event: ${err.message}`);
          }
        }
      }
    });
    
    // Process events as they arrive
    console.log('Starting to process stream...');
    let done = false;
    
    while (!done) {
      const { value, done: doneReading } = await reader.read();
      done = doneReading;
      
      if (value) {
        // Log the raw chunk before processing
        const chunk = decoder.decode(value, { stream: true });
        const chunkInfo = logRawChunk(chunk, pendingEvents.length);
        
        // Process the chunk through the SSE parser
        parser.feed(chunk);
        
        // Process all pending events that were parsed from this chunk
        for (const event of pendingEvents) {
          logEvent(event, chunkInfo.chunkIndex);
          
          console.log(`Received event: ${event.type}${
            event.text ? ` with text: "${event.text}"` : ''
          }`);
        }
        
        // Clear pending events - this is where events could be lost
        // if more arrive after processing but before clearing
        pendingEvents = [];
      }
    }
    
    console.log('Stream completed');
    return currentLastEventId;
  } catch (error) {
    console.error(`Error streaming events: ${error.message}`);
    throw error;
  }
}

/**
 * Analyze the event sequence for dropped events
 */
function analyzeEventSequence() {
  console.log('\nAnalyzing event sequence...');
  const analysis = [];
  analysis.push(`# Event Stream Analysis (${RUN_ID})\n`);
  
  // Basic statistics
  analysis.push('## Statistics\n');
  analysis.push(`- Total chunks received: ${rawChunks.length}`);
  analysis.push(`- Total events processed: ${receivedEvents.length}`);
  
  // Look for potential dropped events
  analysis.push('\n## Event Sequence Analysis\n');
  
  // Find events with associated classification of 'delimiter'
  const delimiterEvents = receivedEvents.filter(
    evt => evt.event.type === 'generation_tokens' && 
           evt.event.classification === 'delimiter'
  );
  
  analysis.push(`- Delimiter events: ${delimiterEvents.length}`);
  
  // Check what happened after each delimiter event
  analysis.push('\n### Events After Delimiters\n');
  
  for (let i = 0; i < delimiterEvents.length; i++) {
    const delimiterEvent = delimiterEvents[i];
    const delimiterIndex = receivedEvents.indexOf(delimiterEvent);
    
    // Look for the next event
    if (delimiterIndex < receivedEvents.length - 1) {
      const nextEvent = receivedEvents[delimiterIndex + 1];
      analysis.push(`\n#### Delimiter ${i+1}: "${delimiterEvent.event.text}"\n`);
      analysis.push(`- Next event: ${nextEvent.event.type} with text "${nextEvent.event.text || ''}"`);
      
      // Check if events were in same chunk or different chunks
      if (nextEvent.chunkIndex === delimiterEvent.chunkIndex) {
        analysis.push('- **Same chunk**: Both events were in the same chunk');
      } else {
        analysis.push(`- **Different chunks**: Delimiter in chunk ${delimiterEvent.chunkIndex}, next event in chunk ${nextEvent.chunkIndex}`);
        
        // Check if any chunks were skipped
        if (nextEvent.chunkIndex > delimiterEvent.chunkIndex + 1) {
          analysis.push(`- **POTENTIAL DROP**: ${nextEvent.chunkIndex - delimiterEvent.chunkIndex - 1} chunks between delimiter and next event`);
        }
      }
      
      // Check timing
      if (delimiterEvent.event._publishTime && nextEvent.event._publishTime) {
        const timeDiff = nextEvent.event._publishTime - delimiterEvent.event._publishTime;
        analysis.push(`- Time difference between events: ${timeDiff}ms`);
        
        if (timeDiff < 5) {
          analysis.push('- **CLOSE TIMING**: Events published very close together');
        }
      }
      
      // Check if classification changes after delimiter
      if (delimiterEvent.event.classification !== nextEvent.event.classification) {
        analysis.push(`- Classification changed from '${delimiterEvent.event.classification}' to '${nextEvent.event.classification}'`);
      }
    } else {
      analysis.push(`\n#### Delimiter ${i+1}: "${delimiterEvent.event.text}"\n`);
      analysis.push('- **LAST EVENT**: No events after this delimiter');
    }
  }
  
  // Look at raw chunks for clues
  analysis.push('\n## Raw Chunk Analysis\n');
  
  const pendingCountsByChunk = rawChunks.map(chunk => chunk.pendingEventsCount);
  analysis.push(`- pendingEvents counts per chunk: ${pendingCountsByChunk.join(', ')}`);
  
  // Look for non-zero pending events
  const nonZeroPending = rawChunks.filter(chunk => chunk.pendingEventsCount > 0);
  if (nonZeroPending.length > 0) {
    analysis.push(`- ${nonZeroPending.length} chunks had non-zero pending events`);
    
    // Look for consecutive chunks with the same count (potential drops)
    for (let i = 0; i < rawChunks.length - 1; i++) {
      if (rawChunks[i].pendingEventsCount > 0 && 
          rawChunks[i].pendingEventsCount === rawChunks[i+1].pendingEventsCount) {
        analysis.push(`- **POTENTIAL DROP**: Chunks ${i} and ${i+1} both had ${rawChunks[i].pendingEventsCount} pending events`);
      }
    }
  }
  
  // Overall assessment
  analysis.push('\n## Summary\n');
  
  // Compare events received vs expected
  // This depends on knowing what the server sent
  const lastEvent = receivedEvents[receivedEvents.length - 1];
  if (lastEvent && lastEvent.event.type === 'agent_message_success') {
    analysis.push('- Stream completed successfully with agent_message_success event');
  } else {
    analysis.push('- Stream did not end with agent_message_success event');
  }
  
  // Check for expected delimiter pairs
  const thinkingOpens = receivedEvents.filter(e => e.event.text && e.event.text.includes('<thinking')).length;
  const thinkingCloses = receivedEvents.filter(e => e.event.text && e.event.text.includes('</thinking>')).length;
  
  if (thinkingOpens !== thinkingCloses) {
    analysis.push(`- **IMBALANCE**: ${thinkingOpens} <thinking> tags but ${thinkingCloses} </thinking> tags`);
  }
  
  const responseOpens = receivedEvents.filter(e => e.event.text && e.event.text.includes('<response')).length;
  
  if (responseOpens === 0) {
    analysis.push('- **MISSING**: No <response> tag found');
  }
  
  // Write analysis to file
  fs.writeFileSync(ANALYSIS_FILE, analysis.join('\n'));
  console.log(`Analysis written to: ${ANALYSIS_FILE}`);
  
  return analysis.join('\n');
}

/**
 * Main function to run the test
 */
async function main() {
  try {
    console.log('Starting event streaming test...');
    console.log(`Raw chunks will be logged to: ${CHUNK_LOG_FILE}`);
    console.log(`Processed events will be logged to: ${EVENTS_LOG_FILE}`);
    
    // Create a channel
    const channelId = await createChannel();
    
    // Start event collection
    const eventStreamPromise = streamEvents(channelId);
    
    // Wait a moment before triggering events
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Trigger event generation
    await triggerEvents(channelId);
    
    // Wait for event stream to complete
    await eventStreamPromise;
    
    // Close log streams
    chunkLogStream.end();
    eventsLogStream.end();
    
    // Analyze results
    console.log('\nTest completed. Analyzing results...');
    const analysis = analyzeEventSequence();
    
    console.log('\nTest and analysis complete!');
    console.log(`Check ${ANALYSIS_FILE} for detailed analysis`);
  } catch (error) {
    console.error(`Error in test: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the test
main();