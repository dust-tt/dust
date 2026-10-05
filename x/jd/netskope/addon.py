import asyncio
import logging
import os

from mitmproxy import ctx, http

logger = logging.getLogger("netskope-sim")
LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
STREAM_TYPES = {"text/event-stream", "application/x-ndjson", "application/stream+json"}
PORT_OFFSETS = {
    3000: 0,
    3001: 1,
    3002: 2,
    3006: 6,
    3007: 7,
    3010: 10,
    3011: 11,
    6006: 8,
}


class NetskopeSimulator:
    def __init__(self):
        self.buffer = os.getenv("NS_BUFFER", "1") == "1"
        self.buffer_bytes = int(os.getenv("NS_BUFFER_BYTES", "0"))
        self.idle_seconds = int(os.getenv("NS_IDLE_KILL", "0"))
        self.latency_ms = int(os.getenv("NS_LATENCY_MS", "0"))
        self.strip = os.getenv("NS_STRIP_HEADERS", "1") == "1"
        self.corrupt_encoding = os.getenv("NS_CORRUPT_ENCODING", "0") == "1"
        self.block_sse = os.getenv("NS_BLOCK_SSE", "0") == "1"
        self.block_ws = os.getenv("NS_BLOCK_WS", "0") == "1"
        self.base_port = int(os.getenv("NS_HIVE_BASE_PORT", "0"))

    def load(self, loader):
        if min(self.buffer_bytes, self.idle_seconds, self.latency_ms) < 0:
            raise ValueError(
                "NS_BUFFER_BYTES, NS_IDLE_KILL and NS_LATENCY_MS must be nonnegative"
            )
        if self.idle_seconds:
            ctx.options.update(tcp_timeout=self.idle_seconds, http2_ping_keepalive=0)
        logger.info(
            "netskope-sim ready buffer=%s threshold=%d idle_seconds=%d latency_ms=%d strip=%s",
            self.buffer,
            self.buffer_bytes,
            self.idle_seconds,
            self.latency_ms,
            self.strip,
        )

    def requestheaders(self, flow: http.HTTPFlow):
        if flow.request.host not in LOCAL_HOSTS:
            return
        flow.metadata["netskope_sim"] = True
        original_port = flow.request.port
        if self.base_port:
            if original_port in PORT_OFFSETS:
                flow.request.port = self.base_port + PORT_OFFSETS[original_port]
            if self.base_port <= flow.request.port < self.base_port + 100:
                flow.request.scheme = "http"
                flow.request.host = "localhost"
        if self.strip:
            flow.request.headers["accept-encoding"] = "identity"
        wants_sse = "text/event-stream" in flow.request.headers.get("accept", "")
        wants_ws = flow.request.headers.get("upgrade", "").lower() == "websocket"
        if (self.block_sse and wants_sse) or (self.block_ws and wants_ws):
            flow.response = http.Response.make(
                403,
                b"Blocked by local Netskope simulator\n",
                {"content-type": "text/plain"},
            )
            logger.info(
                "netskope-sim blocked flow=%s sse=%s websocket=%s",
                flow.id,
                wants_sse,
                wants_ws,
            )

    async def responseheaders(self, flow: http.HTTPFlow):
        if not flow.metadata.get("netskope_sim") or flow.response is None:
            return
        response = flow.response
        content_type = (
            response.headers.get("content-type", "").split(";")[0].strip().lower()
        )
        is_stream = content_type in STREAM_TYPES
        mode = "pass"
        if is_stream:
            mode = (
                f"chunk:{self.buffer_bytes}"
                if self.buffer_bytes
                else ("full" if self.buffer else "pass")
            )
        response.headers["x-netskope-sim"] = mode
        response.headers["x-netskope-sim-upstream-port"] = str(flow.request.port)
        if self.strip and is_stream:
            response.headers.pop("x-accel-buffering", None)
            directives = [
                value.strip()
                for value in response.headers.get("cache-control", "").split(",")
                if value.strip() and value.strip().lower() != "no-transform"
            ]
            if directives:
                response.headers["cache-control"] = ", ".join(directives)
            else:
                response.headers.pop("cache-control", None)
            encoding = response.headers.get("content-encoding", "").lower()
            if encoding in {"", "none", "identity"} or self.corrupt_encoding:
                response.headers.pop("content-encoding", None)
        if not is_stream:
            response.stream = True
            return
        logger.info(
            "netskope-sim stream flow=%s mode=%s upstream_port=%d",
            flow.id,
            mode,
            flow.request.port,
        )
        if self.latency_ms:
            await asyncio.sleep(self.latency_ms / 1000)
        if self.buffer_bytes:
            pending = bytearray()

            def chunker(data: bytes):
                pending.extend(data)
                if not data or len(pending) >= self.buffer_bytes:
                    output = bytes(pending)
                    pending.clear()
                    logger.info(
                        "netskope-sim flush flow=%s bytes=%d eof=%s",
                        flow.id,
                        len(output),
                        not data,
                    )
                    return output
                return b""

            response.stream = chunker
        else:
            response.stream = not self.buffer

    def response(self, flow: http.HTTPFlow):
        if (
            flow.metadata.get("netskope_sim")
            and flow.response is not None
            and flow.response.headers.get("x-netskope-sim") != "pass"
        ):
            logger.info("netskope-sim complete flow=%s", flow.id)
