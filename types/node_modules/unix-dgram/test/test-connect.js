var assert = require('assert');
var fs = require('fs');

var unix = require('../lib/unix_dgram');
var SOCKNAME = '/tmp/unix_dgram.sock';

var seenCount = 0;
var expected = 300; // arbitrary enough to generate congestion

process.on('exit', function() {
  assert.equal(seenCount, expected);
});

try { fs.unlinkSync(SOCKNAME); } catch (e) { /* swallow */ }

var server = unix.createSocket('unix_dgram', function(buf, rinfo) {
  assert.equal('' + buf, 'PING' + seenCount);
  if (++ seenCount === expected) {
    server.close();
    client.close();
  }
});
server.bind(SOCKNAME);

var client = unix.createSocket('unix_dgram', function(buf, rinfo) {
  assert(0);
});

client.on('error', function(err) {
  console.error(err);
  assert(0);
});

// This test case create a huge congestion which throw a warn (possible EventEmitter memory leak detected)
// In real process, it would be handled a smarter way (queued to re-send...)
client.setMaxListeners(300);

client.on('connect', function() {
  console.error('connected');
  client.on('congestion', function(buf) {
    client.once('writable', function() {
      client.send(buf);
    });
  });

  var msg;
  for(var i=0; i<expected; i++) {
    msg = Buffer.from('PING' + i);
    client.send(msg);
  }
});

client.connect(SOCKNAME);
