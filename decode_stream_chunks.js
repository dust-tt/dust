#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Check if file path is provided
if (process.argv.length < 3) {
  console.error('Usage: node decode_stream_chunks.js <logfile>');
  process.exit(1);
}

const logFilePath = process.argv[2];
const outputFilePath = path.join(
  path.dirname(logFilePath),
  `decoded-${path.basename(logFilePath)}`
);

async function decodeChunks() {
  // Create read stream and readline interface
  const fileStream = fs.createReadStream(logFilePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  // Create write stream for the decoded output
  const outputStream = fs.createWriteStream(outputFilePath);
  
  // Track information for summary
  let totalChunks = 0;
  let totalBytes = 0;
  const chunkSizes = [];
  const eventCounts = [];
  
  try {
    // Process each line in the log file
    for await (const line of rl) {
      try {
        // Parse the JSON entry
        const entry = JSON.parse(line);
        totalChunks++;
        
        // Extract data from the entry
        const { timestamp, chunkIndex, chunkSize, chunkBase64, pendingEventsCount } = entry;
        totalBytes += chunkSize;
        chunkSizes.push(chunkSize);
        eventCounts.push(pendingEventsCount);
        
        // Decode the base64 chunk
        const decodedBuffer = Buffer.from(chunkBase64, 'base64');
        const decodedText = decodedBuffer.toString('utf-8');
        
        // Format output with metadata and content
        outputStream.write(`====== CHUNK #${chunkIndex} ======\n`);
        outputStream.write(`Timestamp: ${timestamp}\n`);
        outputStream.write(`Size: ${chunkSize} bytes\n`);
        outputStream.write(`Pending Events: ${pendingEventsCount}\n`);
        outputStream.write(`Content (base64):\n${chunkBase64.substring(0, 100)}${chunkBase64.length > 100 ? '...' : ''}\n`);
        outputStream.write(`Decoded Content:\n${decodedText}\n\n`);
        
        // Also print a short summary to console for each chunk
        console.log(`Processed chunk #${chunkIndex}: ${chunkSize} bytes, ${pendingEventsCount} pending events`);
      } catch (err) {
        console.error(`Error processing line: ${err.message}`);
      }
    }
    
    // Calculate and write summary statistics
    const avgChunkSize = totalBytes / totalChunks;
    const maxChunkSize = Math.max(...chunkSizes);
    const maxEventCount = Math.max(...eventCounts);
    
    outputStream.write('\n========== SUMMARY ==========\n');
    outputStream.write(`Total chunks: ${totalChunks}\n`);
    outputStream.write(`Total bytes: ${totalBytes}\n`);
    outputStream.write(`Average chunk size: ${avgChunkSize.toFixed(2)} bytes\n`);
    outputStream.write(`Max chunk size: ${maxChunkSize} bytes\n`);
    outputStream.write(`Max pending events: ${maxEventCount}\n`);
    
    const sameEventCountSequences = findSequencesWithSameEventCount(eventCounts);
    if (sameEventCountSequences.length > 0) {
      outputStream.write('\nSequences with same pending event count (potential dropped events):\n');
      sameEventCountSequences.forEach(seq => {
        outputStream.write(`- Chunks ${seq.start}-${seq.end} (${seq.count} chunks) with ${seq.eventCount} pending events\n`);
      });
    }
    
    console.log(`\nDecoding complete! Output written to: ${outputFilePath}`);
    console.log(`Processed ${totalChunks} chunks with a total of ${totalBytes} bytes.`);
  } catch (err) {
    console.error(`Error: ${err.message}`);
  } finally {
    outputStream.end();
  }
}

/**
 * Find sequences of chunks with the same non-zero pending event count
 * This can help identify places where events might be dropped
 */
function findSequencesWithSameEventCount(eventCounts) {
  const sequences = [];
  let currentSeq = null;
  
  for (let i = 0; i < eventCounts.length; i++) {
    const count = eventCounts[i];
    
    // Only track non-zero event counts
    if (count === 0) {
      if (currentSeq) {
        if (currentSeq.count > 1) {
          sequences.push({...currentSeq});
        }
        currentSeq = null;
      }
      continue;
    }
    
    if (currentSeq && currentSeq.eventCount === count) {
      // Continue the current sequence
      currentSeq.end = i;
      currentSeq.count++;
    } else {
      // Start a new sequence
      if (currentSeq && currentSeq.count > 1) {
        sequences.push({...currentSeq});
      }
      currentSeq = {
        start: i,
        end: i,
        count: 1,
        eventCount: count
      };
    }
  }
  
  // Add the last sequence if it exists
  if (currentSeq && currentSeq.count > 1) {
    sequences.push(currentSeq);
  }
  
  return sequences;
}

// Execute the main function
decodeChunks().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});