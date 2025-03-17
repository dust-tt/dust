# node-unix-dgram

Communicate over UNIX datagram sockets.

## Usage

Server:

    // One-shot server.  Note that the server cannot send a reply;
    // UNIX datagram sockets are unconnected and the client is not addressable.
    var unix = require('unix-dgram');
    var server = unix.createSocket('unix_dgram', function(buf) {
      console.log('received ' + buf);
      server.close();
    });
    server.bind('/path/to/socket');

Client:

    // Send a single message to the server.
    var message = Buffer('ping');
    var client = unix.createSocket('unix_dgram');
    client.on('error', console.error);
    client.send(message, 0, message.length, '/path/to/socket');
    client.close();


## API

Caveat emptor: events and callbacks are synchronous for efficiency reasons.

### unix.createSocket(type, [listener])

Returns a new unix.Socket object.  `type` should be `'unix_dgram'`.
Throws an exception if the `socket(2)` system call fails.

The optional `listener` argument is added as a listener for the `'message'`
event.  The event listener receives the message as a `Buffer` object as its
first argument.

### socket.bind(path)

Create a server at `path`.  Emits a `'listening'` event on success or
an `'error'` event if the `bind(2)` system call fails.

### socket.connect(remote_path)

Associate a socket with a remote path so you can send a message without setting
the remote path. Once the socket is **connected** it emits a `'connect'` event.
It also allows to perform some kind of congestion control as it emits a
`'congestion'` event when the receiving buffer is full, and a `'writable'` event
when it stops being full.

### socket.send(buf, [callback])

Only to be used with **connected** sockets. It sends a message to the remote
path associated with the socket

Example:

    var unix = require('unix-dgram');

    var client = unix.createSocket('unix_dgram');

    client.on('error', function(err) {
        console.error(err);
    });

    client.on('connect', function() {
        console.log('connected');
        client.on('congestion', function() {
            console.log('congestion');
            /* The server is not accepting data */
        });

        client.on('writable', function() {
            console.log('writable');
            /* The server can accept data */
        });

        var message = new Buffer('PING');
        client.send(message);
    });

    client.connect('/tmp/server');


### socket.send_to(buf, offset, length, path, [callback]);

Send a message to the server listening at `path`.

`buf` is a `Buffer` object containing the message to send, `offset` is
the offset into the buffer and `length` is the length of the message.

For backwards compatibility, you can still use the `socket.send` function with
this same signature.

Example:

    var buf = new Buffer('foobarbaz');
    socket.send(buf, 3, 4, '/path/to/socket');  // Sends 'barb'.

### socket.close()

Close the socket.  If the socket was bound to a path with `socket.bind()`,
then you will no longer receive new messages.  The file system entity
(the socket file) is not automatically unlinked.
