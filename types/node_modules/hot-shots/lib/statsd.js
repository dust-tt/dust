const process = require('process'),
  util = require('util'),
  helpers = require('./helpers'),
  applyStatsFns = require('./statsFunctions');

const constants = require('./constants');
const createTransport = require('./transport');

const PROTOCOL = constants.PROTOCOL;
const TCP_ERROR_CODES = constants.tcpErrors();
const UDS_ERROR_CODES = constants.udsErrors();
const TCP_DEFAULT_GRACEFUL_RESTART_LIMIT = 1000;
const UDS_DEFAULT_GRACEFUL_RESTART_LIMIT = 1000;
const CACHE_DNS_TTL_DEFAULT = 60000;
// DD_ENV_GLOBAL_TAGS_MAPPING is a mapping of each "DD_" prefixed environment variable to a specific tag name.
const DD_ENV_GLOBAL_TAGS_MAPPING = {
  DD_ENTITY_ID: 'dd.internal.entity_id', // Client-side entity ID injection for container tagging.
  DD_ENV: 'env', // The name of the env in which the service runs.
  DD_SERVICE: 'service', // The name of the running service.
  DD_VERSION: 'version', // The current version of the running service.
};

/**
 * The Client for StatsD.  The main entry-point for hot-shots.  Note adding new parameters
 * to the constructor is deprecated- please use the constructor as one options object.
 * @constructor
 */
const Client = function (host, port, prefix, suffix, globalize, cacheDns, mock,
    globalTags, maxBufferSize, bufferFlushInterval, telegraf, sampleRate, protocol) {
  let options = host || {};

  // Adding options below is DEPRECATED.  Use the options object instead.
  if (arguments.length > 1 || typeof(host) === 'string') {
    options = {
      host        : host,
      port        : port,
      prefix      : prefix,
      suffix      : suffix,
      globalize   : globalize,
      cacheDns    : cacheDns,
      mock        : mock === true,
      globalTags  : globalTags,
      maxBufferSize : maxBufferSize,
      bufferFlushInterval: bufferFlushInterval,
      telegraf    : telegraf,
      sampleRate  : sampleRate,
      protocol    : protocol
    };
  }


  // hidden global_tags option for backwards compatibility
  options.globalTags = options.globalTags || options.global_tags;

  this.protocol = (options.protocol && options.protocol.toLowerCase());
  if (! this.protocol) {
    this.protocol = PROTOCOL.UDP;
  }
  this.cacheDns = options.cacheDns === true;
  this.cacheDnsTtl = options.cacheDnsTtl || CACHE_DNS_TTL_DEFAULT;
  this.host = options.host || process.env.DD_AGENT_HOST;
  this.port = options.port || parseInt(process.env.DD_DOGSTATSD_PORT, 10) || 8125;
  this.path = options.path;
  this.stream = options.stream;
  this.prefix = options.prefix || '';
  this.suffix = options.suffix || '';
  this.tagPrefix = options.tagPrefix || '#';
  this.tagSeparator = options.tagSeparator || ',';
  this.mock        = options.mock;
  this.globalTags  = typeof options.globalTags === 'object' ?
      helpers.formatTags(options.globalTags, options.telegraf) : [];
  const availableDDEnvs = Object.keys(DD_ENV_GLOBAL_TAGS_MAPPING).filter(key => process.env[key]);
  if (availableDDEnvs.length > 0) {
    this.globalTags = this.globalTags.
      filter((item) => !availableDDEnvs.some(env => item.startsWith(`${DD_ENV_GLOBAL_TAGS_MAPPING[env]}:`))).
      concat(availableDDEnvs.map(env => `${DD_ENV_GLOBAL_TAGS_MAPPING[env]}:${helpers.sanitizeTags(process.env[env])}`));
  }
  this.telegraf = options.telegraf || false;
  this.maxBufferSize = options.maxBufferSize || 0;
  this.sampleRate = options.sampleRate || 1;
  this.bufferFlushInterval = options.bufferFlushInterval || 1000;
  this.bufferHolder = options.isChild ? options.bufferHolder : { buffer: '' };
  this.errorHandler = options.errorHandler;
  this.tcpGracefulErrorHandling = 'tcpGracefulErrorHandling' in options ? options.tcpGracefulErrorHandling : true;
  this.tcpGracefulRestartRateLimit = options.tcpGracefulRestartRateLimit || TCP_DEFAULT_GRACEFUL_RESTART_LIMIT; // only recreate once per second
  this.udsGracefulErrorHandling = 'udsGracefulErrorHandling' in options ? options.udsGracefulErrorHandling : true;
  this.udsGracefulRestartRateLimit = options.udsGracefulRestartRateLimit || UDS_DEFAULT_GRACEFUL_RESTART_LIMIT; // only recreate once per second
  this.isChild = options.isChild;
  this.closingFlushInterval = options.closingFlushInterval || 50;
  this.udpSocketOptions = options.udpSocketOptions || { type: 'udp4' };

  // If we're mocking the client, create a buffer to record the outgoing calls.
  if (this.mock) {
    this.mockBuffer = [];
  }

  // We only want a single flush event per parent and all its child clients
  if (!options.isChild && this.maxBufferSize > 0) {
    this.intervalHandle = setInterval(this.onBufferFlushInterval.bind(this), this.bufferFlushInterval);
    // do not block node from shutting down
    this.intervalHandle.unref();
  }

  if (options.isChild) {
    if (options.dnsError) {
      this.dnsError = options.dnsError;
    }
    this.socket = options.socket;
  } else if (options.useDefaultRoute) {
    const defaultRoute = helpers.getDefaultRoute();
    if (defaultRoute) {
      console.log(`Got ${defaultRoute} for the system's default route`);
      this.host = defaultRoute;
    }
  }

  if (!this.socket) {
    trySetNewSocket(this);
  }

  if (this.socket && !options.isChild && options.errorHandler) {
    this.socket.on('error', options.errorHandler);
  }

  if (options.globalize) {
    global.statsd = this;
  }

  // only for TCP/UDS (options.protocol tcp/uds)
  // enabled with the extra flag options.tcpGracefulErrorHandling/options.udsGracefulErrorHandling
  // will gracefully (attempt) to re-open the socket with a small delay
  // options.tcpGracefulRestartRateLimit/options.udsGracefulRestartRateLimit is the minimum time (ms) between creating sockets
  // does not support options.isChild (how to re-create a socket you didn't create?)
  if (this.socket) {
    maybeAddProtocolErrorHandler(this, options.protocol);
  }

  this.messagesInFlight = 0;
  this.CHECKS = {
    OK: 0,
    WARNING: 1,
    CRITICAL: 2,
    UNKNOWN: 3,
  };
};

applyStatsFns(Client);

/**
 * Checks if stats is an array and sends all stats calling back once all have sent
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param type The type of the metric
 * @param sampleRate {Number=} The Number of times to sample (0 to 1). Optional.
 * @param tags {Array=} The Array of tags to add to metrics. Optional.
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendAll = function (stat, value, type, sampleRate, tags, callback) {
  let completed = 0;
  let calledback = false;
  let sentBytes = 0;
  const self = this;

  if (sampleRate && typeof sampleRate !== 'number') {
    callback = tags;
    tags = sampleRate;
    sampleRate = undefined;
  }

  if (tags && typeof tags !== 'object') {
    callback = tags;
    tags = undefined;
  }

  /**
   * Gets called once for each callback, when all callbacks return we will
   * call back from the function
   * @private
   */
  function onSend(error, bytes) {
    completed += 1;
    if (calledback) {
      return;
    }

    if (error) {
      if (typeof callback === 'function') {
        calledback = true;
        callback(error);
      } else if (self.errorHandler) {
        calledback = true;
        self.errorHandler(error);
      }
      return;
    }

    if (bytes) {
      sentBytes += bytes;
    }

    if (completed === stat.length && typeof callback === 'function') {
      callback(null, sentBytes);
    }
  }

  if (Array.isArray(stat)) {
    stat.forEach(item => {
      self.sendStat(item, value, type, sampleRate, tags, onSend);
    });
  } else {
    this.sendStat(stat, value, type, sampleRate, tags, callback);
  }
};

/**
 * Sends a stat across the wire
 * @param stat {String|Array} The stat(s) to send
 * @param value The value to send
 * @param type {String} The type of message to send to statsd
 * @param sampleRate {Number} The Number of times to sample (0 to 1)
 * @param tags {Array} The Array of tags to add to metrics
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendStat = function (stat, value, type, sampleRate, tags, callback) {
  let message = `${this.prefix + stat + this.suffix}:${value}|${type}`;
  sampleRate = sampleRate || this.sampleRate;
  if (sampleRate && sampleRate < 1) {
    if (Math.random() < sampleRate) {
      message += `|@${sampleRate}`;
    } else {
      // don't want to send if we don't meet the sample ratio
      return callback ? callback() : undefined;
    }
  }
  this.send(message, tags, callback);
};

/**
 * Send a stat or event across the wire
 * @param message {String} The constructed message without tags
 * @param tags {Array} The tags to include (along with global tags). Optional.
 * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
 */
Client.prototype.send = function (message, tags, callback) {
  let mergedTags = this.globalTags;
  if (tags && typeof tags === 'object') {
    mergedTags = helpers.overrideTags(mergedTags, tags, this.telegraf);
  }
  if (mergedTags.length > 0) {
    if (this.telegraf) {
      message = message.split(':');
      message = `${message[0]},${mergedTags.join(',').replace(/:/g, '=')}:${message.slice(1).join(':')}`;
    } else {
      message += `|${this.tagPrefix}${mergedTags.join(this.tagSeparator)}`;
    }
  }

  this._send(message, callback);
};

/**
 * Send a stat or event across the wire
 * @param message {String} The constructed message without tags
 * @param callback {Function=} Callback when message is done being delivered (only if maxBufferSize == 0). Optional.
 */
Client.prototype._send = function (message, callback) {
  // we may have a cached error rather than a cached lookup, so
  // throw it on
  if (this.dnsError) {
    if (callback) {
      return callback(this.dnsError);
    } else if (this.errorHandler) {
      return this.errorHandler(this.dnsError);
    }
    throw this.dnsError;
  }

  // Only send this stat if we're not a mock Client.
  if (!this.mock) {
    if (this.maxBufferSize === 0) {
      this.sendMessage(message, callback);
    } else {
      this.enqueue(message, callback);
    }
  } else {
    this.mockBuffer.push(message);
    if (typeof callback === 'function') {
      callback(null, 0);
    }
  }
};

/**
 * Add the message to the buffer and flush the buffer if needed
 *
 * @param message {String} The constructed message without tags
 */
Client.prototype.enqueue = function (message, callback) {
  message += '\n';

  if (this.bufferHolder.buffer.length + message.length > this.maxBufferSize) {
    this.flushQueue(callback);
    this.bufferHolder.buffer += message;
  }
  else {
    this.bufferHolder.buffer += message;
    if (callback) {
      callback(null);
    }
  }
};

/**
 * Flush the buffer, sending on the messages
 */
Client.prototype.flushQueue = function (callback) {
  this.sendMessage(this.bufferHolder.buffer, callback);
  this.bufferHolder.buffer = '';
};

/**
 * Send on the message through the socket
 *
 * @param message {String} The constructed message without tags
 * @param callback {Function=} Callback when message is done being delivered. Optional.
 */
Client.prototype.sendMessage = function (message, callback) {
  // don't waste the time if we aren't sending anything
  if (message === '') {
    if (callback) {
      callback(null);
    }
    return;
  }

  const socketWasMissing = !this.socket;
  if (socketWasMissing && (this.protocol === PROTOCOL.TCP || this.protocol === PROTOCOL.UDS)) {
    trySetNewSocket(this);
    if (this.socket) {
      // On success, add custom TCP/UDS error handling.
      maybeAddProtocolErrorHandler(this, this.protocol, Date.now());
    }
  }

  if (socketWasMissing) {
    const error = new Error('Socket not created properly. Check previous errors for details.');
    if (callback) {
      return callback(error);
    } else if (this.errorHandler) {
      return this.errorHandler(error);
    } else {
      return console.error(String(error));
    }
  }

  const handleCallback = (err, bytes) => {
    this.messagesInFlight--;
    const errFormatted = err ? new Error(`Error sending hot-shots message: ${err}`) : null;
    if (errFormatted) {
      errFormatted.code = err.code;
      // handle TCP/UDS error that requires socket replacement when we are not
      // emitting the `error` event on `this.socket`
      if ((this.protocol === PROTOCOL.TCP || this.protocol === PROTOCOL.UDS) && (callback || this.errorHandler)) {
        protocolErrorHandler(this, this.protocol, err);
      }
    }
    if (callback) {
      callback(errFormatted, bytes);
    } else if (errFormatted) {
      if (this.errorHandler) {
        this.errorHandler(errFormatted);
      } else {
        console.error(String(errFormatted));
        // emit error ourselves on the socket for backwards compatibility
        this.socket.emit('error', errFormatted);
      }
    }
  };

  try {
    this.messagesInFlight++;
    this.socket.send(Buffer.from(message), handleCallback);
  } catch (err) {
    handleCallback(err);
  }
};

/**
 * Called every bufferFlushInterval to flush any buffer that is around
 */
Client.prototype.onBufferFlushInterval = function () {
  this.flushQueue();
};

/**
 * Close the underlying socket and stop listening for data on it.
 */
Client.prototype.close = function (callback) {
  // stop trying to flush the queue on an interval
  if (this.intervalHandle) {
    clearInterval(this.intervalHandle);
  }

  // flush the queue one last time, if needed
  this.flushQueue((err) => {
    if (err) {
      if (callback) {
        return callback(err);
      }
      else {
        return console.error(err);
      }
    }

    // FIXME: we have entered callback hell, and this whole file is in need of an async rework

    // wait until there are no more messages in flight before really closing the socket
    let intervalAttempts = 0;
    const waitForMessages = setInterval(() => {
      intervalAttempts++;
      if (intervalAttempts > 10) {
        console.log('hot-shots could not clear out messages in flight but closing anyways');
        this.messagesInFlight = 0;
      }
      if (this.messagesInFlight <= 0) {
        clearInterval(waitForMessages);
        this._close(callback);
      }
    }, this.closingFlushInterval);
  });
};

/**
 * Really close the socket and handle any errors related to it
 */
Client.prototype._close = function (callback) {
  // If there was an error creating it, nothing to do here
  if (! this.socket) {
    if (callback) {
      callback();
    }
    return;
  }

  // error function to use in callback and catch below
  let handledError = false;
  const handleErr = (err) => {
    const errMessage = `Error closing hot-shots socket: ${err}`;
    if (handledError) {
      console.error(errMessage);
    }
    else {
      // The combination of catch and error can lead to some errors
      // showing up twice.  So we just show one of the errors that occur
      // on close.
      handledError = true;

      if (callback) {
        callback(new Error(errMessage));
      } else if (this.errorHandler) {
        this.errorHandler(new Error(errMessage));
      } else {
        console.error(errMessage);
      }
    }
  };

  if (this.errorHandler) {
    this.socket.removeListener('error', this.errorHandler);
  }

  // handle error and close events
  this.socket.on('error', handleErr);
  if (callback) {
    this.socket.on('close', err => {
      if (! handledError && callback) {
        callback(err);
      }
    });
  }

  try {
    this.socket.close();
  } catch (err) {
    handleErr(err);
  }
};

const ChildClient = function (parent, options) {
  options = options || {};
  Client.call(this, {
    isChild     : true,
    socket      : parent.socket, // Child inherits socket from parent. Parent itself can be a child.
    // All children and parent share the same buffer via sharing an object (cannot mutate strings)
    bufferHolder: parent.bufferHolder,
    dnsError    : parent.dnsError, // Child inherits an error from parent (if it is there)
    errorHandler: options.errorHandler || parent.errorHandler, // Handler for callback errors
    host        : parent.host,
    port        : parent.port,
    tagPrefix   : parent.tagPrefix,
    tagSeparator : parent.tagSeparator,
    prefix      : (options.prefix || '') + parent.prefix, // Child has its prefix prepended to parent's prefix
    suffix      : parent.suffix + (options.suffix || ''), // Child has its suffix appended to parent's suffix
    globalize   : false, // Only 'root' client can be global
    mock        : parent.mock,
    // Append child's tags to parent's tags
    globalTags  : typeof options.globalTags === 'object' ?
        helpers.overrideTags(parent.globalTags, options.globalTags, parent.telegraf) : parent.globalTags,
    maxBufferSize : parent.maxBufferSize,
    bufferFlushInterval: parent.bufferFlushInterval,
    telegraf    : parent.telegraf,
    protocol    : parent.protocol,
    closingFlushInterval : parent.closingFlushInterval
  });
};
util.inherits(ChildClient, Client);

/**
 * Creates a child client that adds prefix, suffix and/or tags to this client. Child client can itself have children.
 * @param options
 *   @option prefix      {String}  An optional prefix to assign to each stat name sent
 *   @option suffix      {String}  An optional suffix to assign to each stat name sent
 *   @option globalTags {Array=} Optional tags that will be added to every metric
 */
Client.prototype.childClient = function (options) {
  return new ChildClient(this, options);
};

exports = module.exports = Client;
exports.StatsD = Client;

/**
 * Detect and handle an error connecting to a TCP/UDS socket. This will
 * attempt to create a new socket and replace and close the client's current
 * socket, registering a **new** `protocolErrorHandler()` on the newly created socket.
 * If a new socket can't be created (e.g. if no TCP/UDS currently exists at
 * `client.path`) then this will leave the existing socket intact.
 *
 * Note that this will no-op with an early exit if the last socket create time
 * was too recent (within the TCP/UDS graceful restart rate limit).
 * @param client Client The statsd Client that may be getting a TCP/UDS error handler.
 * @param protocol Client configured protocol
 * @param err The error that we will handle if a TCP/UDS connection error is detected.
 */
function protocolErrorHandler(client, protocol, err) {
  if (!err || !client.socket || !client.socket.createdAt) {
    return;
  }

  // recreate the socket, but only once within `tcpGracefulRestartRateLimit`/`udsGracefulRestartRateLimit`.

  if (protocol === PROTOCOL.TCP && (!TCP_ERROR_CODES.includes(-err.code) || Date.now() - client.socket.createdAt < client.tcpGracefulRestartRateLimit)) {
    return;
  } else if (protocol === PROTOCOL.UDS && (!UDS_ERROR_CODES.includes(-err.code) || Date.now() - client.socket.createdAt < client.udsGracefulRestartRateLimit)) {
    return;
  }

  if (client.errorHandler) {
    client.socket.removeListener('error', client.errorHandler);
  }

  const newSocket = createTransport(client, {
    host: client.host,
    path: client.path,
    port: client.port,
    protocol: client.protocol,
  });
  if (newSocket) {
    client.socket.close();
    client.socket = newSocket;
    maybeAddProtocolErrorHandler(client, protocol);
  } else {
    const errorMessage = `Could not replace ${protocol} connection with new socket`;
    if (client.errorHandler) {
      client.errorHandler(new Error(errorMessage));
    } else {
      console.error(errorMessage);
    }
    return;
  }

  if (client.errorHandler) {
    client.socket.on('error', client.errorHandler);
  } else {
    client.socket.on('error', (error) => console.error(`hot-shots ${protocol} error: ${error}`));
  }
}

/**
 * Add a TCP/UDS socket error handler to the client's socket, if the
 * client is not a "child" client and has graceful error handling enabled for
 * TCP/UDS.
 * @param client Client The statsd Client that may be getting a TCP/UDS error handler.
 * @param protocol Client configured protocol
 */
 function maybeAddProtocolErrorHandler(client, protocol) {
  if (client.isChild) {
    return;
  }

  if ((protocol === PROTOCOL.TCP && !client.tcpGracefulErrorHandling) || (protocol === PROTOCOL.UDS && !client.udsGracefulErrorHandling)) {
    return;
  }

  if (protocol === PROTOCOL.TCP || protocol === PROTOCOL.UDS) {
    client.socket.on('error', (err) => {
      protocolErrorHandler(client, protocol, err);
    });
  }
}

/**
 * Try to replace a client's socket with a new transport. If `createTransport()`
 * returns `null` this will still set the client's socket to `null`. This also
 * updates the socket creation time for UDS error handling.
 * @param client Client The statsd Client that will be getting a new socket
 */
function trySetNewSocket(client) {
  client.socket = createTransport(client, {
    host: client.host,
    cacheDns: client.cacheDns,
    cacheDnsTtl: client.cacheDnsTtl,
    path: client.path,
    port: client.port,
    protocol: client.protocol,
    stream: client.stream,
    udpSocketOptions: client.udpSocketOptions,
  });
}
