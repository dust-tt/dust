var assert = require('assert');
var fs = require('fs');

var unix = require('../lib/unix_dgram');
var SOCKNAME = '/tmp/unix_dgram.sock';

try { fs.unlinkSync(SOCKNAME); } catch (e) { /* swallow */ }

var client = unix.createSocket('unix_dgram', function(buf, rinfo) {
  console.error('client recv', arguments);
  assert(0);
});

client.once('error', function(err) {
  assert.ok(err);
  client.once('error', function(err) {
    assert.ifError(err);
  });

  client.send(Buffer.from('ERROR2'), 0, 6, SOCKNAME, function(err) {
    assert.ok(err);
    client.close();
  });
});

client.send(Buffer.from('ERROR1'), 0, 6, SOCKNAME);
