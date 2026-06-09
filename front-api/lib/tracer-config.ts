import tracer from "@app/logger/tracer";

// Hono auto-instrumentation creates one child span per middleware execution.
// Most middlewares are anonymous arrow functions wrapped in createMiddleware(),
// so dd-trace tags them resource.name = '<anonymous>'. Disable middleware spans —
// the matched route is still set on the HTTP server span via web.setRoute().
tracer.use("hono", { middleware: false });
