# Netskope-style streaming proxy

Reproduce buffering, blocked SSE, delayed headers, and idle disconnects locally.
This is a mitmproxy simulator, not the Netskope client or a reproduction of every
Netskope policy. It runs in a dedicated Chrome profile and maps the usual Dust
localhost ports to the current hive. It does not change OS proxy/trust settings,
other browsers, or server-side LLM traffic.

## Start

Requires a dust-hive worktree under `.hives/<name>`, running Dust services, Python
3.10+, `uv`, OpenSSL, and Google Chrome at its standard macOS location. Run these
commands from the worktree root:

```sh
python3 x/jd/netskope/hive.py start full
python3 x/jd/netskope/hive.py browser
```

The first command installs pinned mitmproxy 12.2.3 in a separate virtual environment.
The second opens the app at `http://localhost:3011/`; sign in normally. The proxy
maps that address and local authentication callbacks to this hive's ports.
`buffering_proxy.py` is the mitmproxy entry point; `addon.py` implements the faults.

State lives outside the repository under `~/.dust-hive/envs/<name>/netskope/`:
`venv/`, `ca/`, `chrome/`, `proxy.pid`, `profile.json`, `proxy.log`, and `chrome.log`.
The proxy listens on loopback at the hive base port + 80; Chrome debugging uses
base + 81. For a hive with base port 11000, those ports are 11080 and 11081.

## Check automatic fallback

Leave `agent_stream_long_polling` **disabled** for this comparison. The behavior
under test is SSE first, followed by automatic polling when SSE fails.

1. Run `python3 x/jd/netskope/hive.py start pass` and reload the dedicated browser.
2. Open DevTools → Network, filter for `events`, and send a message. Healthy SSE
   should deliver the response without `/events/poll` requests.
3. Run `python3 x/jd/netskope/hive.py start full`, reload, and clear the Network list.
4. Send another message. Expect cancelled SSE attempts followed by successful
   `/events/poll` requests, and verify the answer actually completes.
5. Repeat with `chunk`, `latency`, and `deny`. Try both a new conversation and a
   follow-up message. Conversation updates, message tokens, child-agent details,
   Frame results, and browser MCP requests exercise different consumers.

An idle poll can take about 25 seconds and then be followed by another pending
poll. A 200 SSE response alone does not prove streaming works: inspect delivered
content. The handshake deadline is 2.5 seconds per attempt; retries add delay.
Concurrent streams can reach the shared failure threshold sooner.

For child-agent tests in a local workspace, set `DUST_PROD_API` to the hive API
URL (for example, `http://localhost:11000`) in the hive's `env.sh`, then restart
`front-api` and `front-workers`. Otherwise, the default development configuration
creates children in the development production workspace, and their local event
requests return 404.

For Frame function tests, run Viz and configure the sandbox callback tunnel to
reach the same hive. `SBX_DEV_FRONT_URL` must reach the API and `SBX_DEV_VIZ_URL`
must reach Viz. Enable `frames_v2` and `frames_v2_functions` in the local workspace.
Use a durable function that runs longer than 10 seconds: faster functions can
return their outcome inline without opening an event stream. Check both success
and error results in the iframe and in the event response.

Restarting the proxy disconnects active requests. Reload after changing scenarios:
the manager retains degraded SSE health for the page session. Do not run the
browser sweep during a manual comparison; it switches the same proxy's profile.

## Profiles

```sh
python3 x/jd/netskope/hive.py start chunk
python3 x/jd/netskope/hive.py status
```

| Profile | Effect |
| --- | --- |
| `pass` | Pass streaming through and preserve headers. |
| `full` | Withhold SSE headers and body until EOF; strip buffering hints. |
| `chunk` | Send headers immediately; buffer body until 16 KiB, flushing the remainder at EOF. |
| `idle` | Pass streaming through; close TCP connections after 10 seconds without socket activity. |
| `latency` | Delay streaming response headers by 4 seconds. |
| `deny` | Return HTTP 403 for requests accepting `text/event-stream`. |
| `websocket` | Return HTTP 403 for WebSocket upgrades, including Vite HMR. |
| `h1` | Disable proxy HTTP/2 support. Local HTTP upstreams already use HTTP/1. |

Override defaults per invocation:

```sh
NS_BUFFER_BYTES=4096 python3 x/jd/netskope/hive.py start chunk
NS_IDLE_KILL=30 python3 x/jd/netskope/hive.py start idle
NS_LATENCY_MS=7000 python3 x/jd/netskope/hive.py start latency
NS_HTTP2=0 python3 x/jd/netskope/hive.py start full
```

Other options are `NS_BUFFER`, `NS_STRIP_HEADERS`, `NS_BLOCK_SSE`, `NS_BLOCK_WS`,
and `NS_CORRUPT_ENCODING`. Booleans are `0` or `1`; numbers are nonnegative integers.
`NS_IDLE_KILL=0` leaves mitmproxy's default TCP timeout in place. This timeout applies
to all connections through the isolated proxy, including nonlocal tunnels. Upstream
heartbeats count as socket activity even when their bytes are buffered.

Fault injection and port remapping apply only to loopback destinations. Header
stripping removes `X-Accel-Buffering` and `no-transform` from streaming responses,
and requests identity encoding. Actual compressed response encodings are preserved
unless `NS_CORRUPT_ENCODING=1` is set. JSON polling and ordinary HTML responses are
not treated as SSE.

## Routing and TLS

`status` prints the active proxy address and log path. For a hive named
`fix-str-shw` with base port 11000:

```sh
curl --noproxy '' -x http://127.0.0.1:11080 -i http://localhost:3000/api/healthz
curl --noproxy '' -x http://127.0.0.1:11080 \
  --cacert ~/.dust-hive/envs/fix-str-shw/netskope/ca/mitmproxy-ca-cert.pem \
  -i https://localhost:11000/api/healthz
```

Responses include `X-Netskope-Sim` and `X-Netskope-Sim-Upstream-Port`. Full buffering
withholds these headers until EOF. Addon logs contain flow IDs, modes, and ports,
without request bodies, cookies, authorization headers, or query strings.

Chrome explicitly proxies loopback and disables QUIC. Only the dedicated Chrome
process accepts the simulator CA's public key. Nonlocal HTTPS destinations such as
AuthKit pass through without TLS interception. Local HTTPS terminates at mitmproxy
and forwards over HTTP to the hive. This does not model production certificate
pinning or enterprise authentication policy.

## Checks

Install dependencies without starting the proxy, then run the six real-proxy tests:

```sh
python3 x/jd/netskope/hive.py setup
python3 x/jd/netskope/test_proxy.py
```

Tests cover full/pass buffering, threshold flushing, idle disconnects, compressed
responses, SSE rejection, and concurrent delayed requests. They use temporary proxy
ports and do not restart the interactive proxy.

With the SPA running and the repository's Node dependencies (including Playwright)
available, run the sweep in a temporary headless Chrome session:

```sh
node x/jd/netskope/check_browser.cjs --headless
```

Omit `--headless` to use the dedicated Chrome window started with `hive.py browser`.

The browser sweep uses the worktree's actual SSE manager and transport with a local
fixture. It checks `pass`, `full`, `chunk`, `latency`, and `deny` without enabling
forced polling or requiring authentication. It opens temporary tabs and restores
`full` afterward. It tests transport delivery; use the manual steps above to check
an authenticated conversation end to end.

A proxy that releases the handshake and then buffers later events needs separate
testing. An agent loop still reported as ongoing switches to polling after 30
seconds without an event, checked on the 10-second ongoing-loop refresh. Other
streams rely on the SSE transport's heartbeat timeout, which can take five minutes.

## Stop

```sh
python3 x/jd/netskope/hive.py stop
```

Close the dedicated Chrome window afterward. This proxy is a separate process:
stopping a hive does not stop it, and it must be started again after a reboot.
