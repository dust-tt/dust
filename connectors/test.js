// Import the required 'fs' module
const fs = require('fs');
const path = require('path');

// Path to the JSON file (change filename as needed)
const filePath = '/Users/toto/Downloads/109ad1d0-18b0-4c9d-9eb1-4706bf50be6c.json';

function cleanUtf8Content(content) {
  if (!/[\uD800-\uDFFF]/.test(content)) {
    return content;
  }
  // Replace invalid high surrogates not followed by a low surrogate with a valid JSON string
  // Replace invalid low surrogates not preceded by a high surrogate with a valid JSON string
  return content
    .replace(/\\uD[89AB][0-9A-F]{2}(?!\\uD[CDEF][0-9A-F]{2})/gi, '\\u003F')
    .replace(/(?<!\\uD[89AB][0-9A-F]{2})\\uD[CDEF][0-9A-F]{2}/gi, '\\u003F');
}

function test(data) {
  const invalidHigh = data.match(/\\uD[89AB][0-9A-F]{2}(?!\\uD[CDEF][0-9A-F]{2})/gi);
  // Find low surrogates not preceded by a high surrogate
  const invalidLow = data.match(/(?<!\\uD[89AB][0-9A-F]{2})\\uD[CDEF][0-9A-F]{2}/gi);

  if ((invalidHigh && invalidHigh.length > 0) || (invalidLow && invalidLow.length > 0)) {
    console.error('File contains invalid Unicode surrogate pairs:');
    if (invalidHigh) console.error('  High surrogates not followed by low:', invalidHigh);
    if (invalidLow) console.error('  Low surrogates not preceded by high:', invalidLow);
  } else {
    console.log('File is valid JSON with valid Unicode surrogate pairs.');
  }
}

// Read the file asynchronously
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }
  try {
    // Find high surrogates not followed by a low surrogate
    test(data);

    const x = cleanUtf8Content(data);
    test(x);
    console.log('==========')
    console.log(JSON.parse(x));
  } catch (parseErr) {
    console.error('Error parsing JSON:', parseErr);
  }
});

