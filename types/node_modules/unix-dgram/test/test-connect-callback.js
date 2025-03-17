var assert = require('assert');
var fs = require('fs');

var unix = require('../lib/unix_dgram');
var SOCKNAME = '/tmp/unix_dgram.sock';

var sentCount = 0;
var seenCount = 0;
var expected = 300;

process.on('exit', function() {
  assert.equal(seenCount, sentCount);
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

client.on('connect', function() {
  console.error('connected');

  client.on('congestion', function() {
    throw new Error('Should not emit congestion');
  });

  client.on('writable', function() {
    // swallow
  });

  function send() {
    var msg = Buffer.from('PING' + sentCount);
    client.send(msg, function(err) {
      if (!err) {
        ++ sentCount;
        if (sentCount < expected) {
          // process.nextTick() in today's Node.js master seems to stall
          // after about ~194 process.nextTick() calls, that's why we
          // use setImmediate() as a workaround.
          setImmediate(send);
        }
      } else if (err.code < 0) {
        throw new Error(err);
      } else {
        client.once('writable', send);
      }
    });
  }

  send();
});

client.connect(SOCKNAME);
