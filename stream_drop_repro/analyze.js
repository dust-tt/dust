#!/usr/bin/env node

/**
 * Analyzer for event stream reproduction test
 * 
 * This script:
 * 1. Reads the raw chunks log and events log
 * 2. Analyzes them for patterns of dropped events
 * 3. Produces a detailed report on the findings
 * 4. Includes visualizations of the event flow
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Check if log files are provided as arguments
const args = process.argv.slice(2);
const logsDir = args[0] || path.join(__dirname, 'logs');

async function analyzeChunksAndEvents() {
  try {
    // Find the most recent logs if not specified
    let chunkLogFile, eventsLogFile;
    
    if (args[1] && args[2]) {
      chunkLogFile = args[1];
      eventsLogFile = args[2];
    } else {
      // Get the latest log files
      const files = fs.readdirSync(logsDir);
      const rawChunkFiles = files.filter(f => f.startsWith('raw-chunks-')).sort();
      const eventsFiles = files.filter(f => f.startsWith('events-')).sort();
      
      if (rawChunkFiles.length === 0 || eventsFiles.length === 0) {
        throw new Error('No log files found. Run the test first.');
      }
      
      chunkLogFile = path.join(logsDir, rawChunkFiles[rawChunkFiles.length - 1]);
      eventsLogFile = path.join(logsDir, eventsFiles[eventsFiles.length - 1]);
    }
    
    console.log(`Analyzing chunk log: ${chunkLogFile}`);
    console.log(`Analyzing events log: ${eventsLogFile}`);
    
    // Parse the logs
    const chunks = await parseLogFile(chunkLogFile);
    const events = await parseLogFile(eventsLogFile);
    
    // Generate timestamp for the report
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const reportFile = path.join(logsDir, `analysis-report-${timestamp}.md`);
    
    // Write the report
    await generateReport(chunks, events, reportFile);
    
    console.log(`Analysis complete. Report written to: ${reportFile}`);
  } catch (error) {
    console.error(`Error during analysis: ${error.message}`);
    process.exit(1);
  }
}

async function parseLogFile(filePath) {
  const entries = [];
  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });
  
  for await (const line of rl) {
    if (line.trim()) {
      try {
        entries.push(JSON.parse(line));
      } catch (err) {
        console.error(`Error parsing line: ${err.message}`);
      }
    }
  }
  
  return entries;
}

async function generateReport(chunks, events, reportFile) {
  const report = [];
  
  // Report header
  report.push('# Event Stream Analysis Report');
  report.push(`Generated: ${new Date().toISOString()}`);
  report.push('');
  
  // Basic statistics
  report.push('## Statistics');
  report.push('');
  report.push(`- **Total chunks received**: ${chunks.length}`);
  report.push(`- **Total events processed**: ${events.length}`);
  report.push(`- **Average chunk size**: ${Math.round(chunks.reduce((sum, chunk) => sum + chunk.chunkSize, 0) / chunks.length)} bytes`);
  report.push('');
  
  // Chunk sizes visualization
  report.push('## Chunk Sizes');
  report.push('');
  
  const maxChunkSize = Math.max(...chunks.map(c => c.chunkSize));
  const scaleFactor = 50 / maxChunkSize;
  
  chunks.forEach((chunk, index) => {
    const barLength = Math.max(1, Math.round(chunk.chunkSize * scaleFactor));
    const bar = '█'.repeat(barLength);
    report.push(`Chunk ${chunk.chunkIndex} (${chunk.chunkSize} bytes): ${bar}`);
  });
  
  report.push('');
  
  // Pending events analysis
  report.push('## Pending Events Analysis');
  report.push('');
  
  const pendingCounts = chunks.map(c => c.pendingEventsCount);
  report.push(`- **Pending events by chunk**: ${pendingCounts.join(', ')}`);
  
  const nonZeroPending = chunks.filter(c => c.pendingEventsCount > 0);
  report.push(`- **Chunks with pending events**: ${nonZeroPending.length}`);
  
  if (nonZeroPending.length > 0) {
    report.push('');
    report.push('Chunks with non-zero pending events:');
    report.push('');
    nonZeroPending.forEach(chunk => {
      report.push(`- Chunk ${chunk.chunkIndex}: ${chunk.pendingEventsCount} pending events`);
    });
  }
  
  // Detect potential dropped events
  report.push('');
  report.push('## Potential Dropped Events');
  report.push('');
  
  let potentialDrops = 0;
  
  // Check for consecutive chunks with the same non-zero pending count
  for (let i = 0; i < chunks.length - 1; i++) {
    if (chunks[i].pendingEventsCount > 0 && 
        chunks[i].pendingEventsCount === chunks[i+1].pendingEventsCount) {
      potentialDrops++;
      report.push(`⚠️ **Potential drop detected**: Chunks ${chunks[i].chunkIndex} and ${chunks[i+1].chunkIndex} both had ${chunks[i].pendingEventsCount} pending events`);
    }
  }
  
  // Check for decreases in pending events without corresponding processed events
  let eventsIndex = 0;
  for (let i = 0; i < chunks.length - 1; i++) {
    const pendingDifference = chunks[i].pendingEventsCount - chunks[i+1].pendingEventsCount;
    
    if (pendingDifference > 0) {
      // Count events processed from this chunk
      const eventsFromChunk = events.filter(e => e.chunkIndex === chunks[i].chunkIndex).length;
      
      if (eventsFromChunk < pendingDifference) {
        potentialDrops++;
        report.push(`⚠️ **Potential drop detected**: Chunk ${chunks[i].chunkIndex} had ${pendingDifference} pending events decrease but only ${eventsFromChunk} processed events`);
      }
    }
  }
  
  if (potentialDrops === 0) {
    report.push('No potential dropped events detected based on pending events counts.');
  }
  
  // Analyze event sequence
  report.push('');
  report.push('## Event Sequence Analysis');
  report.push('');
  
  // Find delimiter events
  const delimiterEvents = events.filter(evt => 
    evt.event.type === 'generation_tokens' && 
    evt.event.classification === 'delimiter'
  );
  
  report.push(`- **Delimiter events**: ${delimiterEvents.length}`);
  report.push('');
  
  // Analyze what happens after delimiter events
  report.push('### Events After Delimiters');
  report.push('');
  
  delimiterEvents.forEach((delimiterEvent, index) => {
    const eventIndex = events.findIndex(e => 
      e.timestamp === delimiterEvent.timestamp && 
      e.event.text === delimiterEvent.event.text
    );
    
    report.push(`#### Delimiter ${index+1}: "${delimiterEvent.event.text}"`);
    
    if (eventIndex < events.length - 1) {
      const nextEvent = events[eventIndex + 1];
      report.push(`- **Next event**: ${nextEvent.event.type}${nextEvent.event.text ? ` with text "${nextEvent.event.text}"` : ''}`);
      
      // Check if events were in same chunk
      if (nextEvent.chunkIndex === delimiterEvent.chunkIndex) {
        report.push('- **Same chunk**: Both events were in the same chunk');
      } else {
        report.push(`- **Different chunks**: Delimiter in chunk ${delimiterEvent.chunkIndex}, next event in chunk ${nextEvent.chunkIndex}`);
        
        // Check if chunks were skipped
        if (nextEvent.chunkIndex > delimiterEvent.chunkIndex + 1) {
          report.push(`- ⚠️ **Skipped chunks**: ${nextEvent.chunkIndex - delimiterEvent.chunkIndex - 1} chunks between delimiter and next event`);
        }
      }
      
      // Check timing
      if (delimiterEvent.event._publishTime && nextEvent.event._publishTime) {
        const timeDiff = nextEvent.event._publishTime - delimiterEvent.event._publishTime;
        report.push(`- **Time between publish**: ${timeDiff}ms`);
        
        if (timeDiff < 5) {
          report.push('- **Close timing**: Events published very close together');
        }
      }
      
      // Check timestamp of event reception at client
      const clientTimeDiff = new Date(nextEvent.timestamp) - new Date(delimiterEvent.timestamp);
      report.push(`- **Time between reception**: ${clientTimeDiff}ms`);
    } else {
      report.push('- ⚠️ **No next event**: This was the last event in the stream');
    }
    
    report.push('');
  });
  
  // Detect tag pairs
  report.push('## Tag Pair Analysis');
  report.push('');
  
  const thinkingOpens = events.filter(e => e.event.text && e.event.text.includes('<thinking')).length;
  const thinkingCloses = events.filter(e => e.event.text && e.event.text.includes('</thinking>')).length;
  
  report.push(`- **<thinking> tags**: ${thinkingOpens}`);
  report.push(`- **</thinking> tags**: ${thinkingCloses}`);
  
  if (thinkingOpens !== thinkingCloses) {
    report.push(`- ⚠️ **Imbalanced thinking tags**: ${Math.abs(thinkingOpens - thinkingCloses)} missing`);
  }
  
  const responseOpens = events.filter(e => e.event.text && e.event.text.includes('<response')).length;
  report.push(`- **<response> tags**: ${responseOpens}`);
  
  if (responseOpens === 0) {
    report.push('- ⚠️ **Missing response tag**: No <response> tag found');
  }
  
  // Find patterns matching the expected issue
  report.push('');
  report.push('## Pattern Matching');
  report.push('');
  report.push('Looking for the specific pattern observed in production:');
  report.push('1. Delimiter event (e.g., "<thinking>" or "<response>")')
  report.push('2. Missing subsequent event that should have content right after the delimiter');
  report.push('');
  
  // Count matches of the pattern
  let patternMatches = 0;
  
  for (let i = 0; i < delimiterEvents.length; i++) {
    const delimiterEvent = delimiterEvents[i];
    const eventIndex = events.indexOf(delimiterEvent);
    
    // Look for content that should follow the delimiter
    if (eventIndex < events.length - 1) {
      const nextEvent = events[eventIndex + 1];
      
      // Check if next event is from a different chunk and there's a delay
      if (nextEvent.chunkIndex > delimiterEvent.chunkIndex && 
          (nextEvent.event._publishTime - delimiterEvent.event._publishTime) <= 3) {
        patternMatches++;
        report.push(`✅ **Pattern match ${patternMatches}**: Found the production issue pattern:`);
        report.push(`  - Delimiter: "${delimiterEvent.event.text}" in chunk ${delimiterEvent.chunkIndex}`);
        report.push(`  - Next event: "${nextEvent.event.text}" in chunk ${nextEvent.chunkIndex}`);
        report.push(`  - Time gap: ${nextEvent.event._publishTime - delimiterEvent.event._publishTime}ms`);
        report.push('');
      }
    }
  }
  
  if (patternMatches === 0) {
    report.push('❌ No instances matching the specific production issue pattern were found.');
  } else {
    report.push(`Found ${patternMatches} instances matching the production issue pattern.`);
  }
  
  // Write the report to a file
  fs.writeFileSync(reportFile, report.join('\n'));
}

// Run the analysis
analyzeChunksAndEvents();