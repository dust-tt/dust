var assert = require('assert');
var fs = require('fs');

var unix = require('../lib/unix_dgram');
var SOCKNAME = '/tmp/unix_dgram.sock';
var SOCKNAME_CLIENT = '/tmp/unix_dgram_client.sock';

var sentPing1 = false;
var sentPing2 = false;
var seenPing1 = false;
var seenPing2 = false;

process.on('exit', function() {
  assert.equal(sentPing1, true);
  assert.equal(sentPing2, true);
  assert.equal(seenPing1, true);
  assert.equal(seenPing2, true);
});

try { fs.unlinkSync(SOCKNAME); } catch (e) { /* swallow */ }
try { fs.unlinkSync(SOCKNAME_CLIENT); } catch (e) { /* swallow */ }

var n = 0;

var server = unix.createSocket('unix_dgram', function(buf, rinfo) {
  console.error('server recv', '' + buf, arguments);
  switch (++n) {
    case 1:
      assert.equal('' + buf, 'PING1');
      assert.equal(rinfo.path, null);
      seenPing1 = true;
      client.bind(SOCKNAME_CLIENT);
      client.send(Buffer.from('PING2'), 0, 5, SOCKNAME, function() {
        console.error('client send', arguments);
        sentPing2 = true;
      });
    break;
    case 2:
      assert.equal('' + buf, 'PING2');
      assert.equal(rinfo.path, SOCKNAME_CLIENT);
      seenPing2 = true;
      server.close();
      client.close();
    break;

  }
});
server.bind(SOCKNAME);

var client = unix.createSocket('unix_dgram', function(buf, rinfo) {
  console.error('client recv', arguments);
  assert(0);
});

client.send(Buffer.from('PING1'), 0, 5, SOCKNAME, function() {
  console.error('client send', arguments);
  sentPing1 = true;
});
