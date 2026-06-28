# @dust-tt/dust-functions

Invoke a Web-standard HTTP handler as if it were serving one request — **without
running a server**. Serverless/Lambda-style: one process per request. Plus a tool
to discover handler I/O contracts for model tool-use.

Runs on [Bun](https://bun.com/) (handlers are plain `.ts` files executed
natively).

```
echo '{"url":"http://localhost/api?name=David"}' | bun run_request.ts ./fixtures/hello.ts
```
```json
{"ok":true,"response":{"status":200,"headers":{"content-type":"application/json;charset=utf-8"},"body":"{\"hello\":\"David\"}","encoding":"utf8"}}
```

## Writing a handler

A handler is the standard fetch-handler convention (Bun, Cloudflare Workers,
Deno Deploy):

```ts
export default {
  async fetch(req: Request): Promise<Response> {
    return Response.json({ ok: true });
  },
};
```

It receives a real `Request` and returns a real `Response`. No knowledge of this
tool is required.

### Declaring an I/O contract (for `discover`)

A handler may also export a `schema` so its input/output contract can be
discovered — e.g. to expose it to an LLM as a callable tool:

```ts
import { z } from "zod";

export const schema = {
  description: "Greet a user by name",
  input: z.object({ name: z.string(), formal: z.boolean().optional() }),
  output: z.object({ greeting: z.string() }),
};
```

`input`/`output` are Zod schemas; all fields are optional.

## Usage

```
bun run_request.ts <handler-file> < request.json
```

### Input (stdin) — one JSON object

| Field      | Type     | Notes                                                  |
|------------|----------|--------------------------------------------------------|
| `url`      | string   | **Required.** Full absolute URL.                       |
| `method`   | string   | Defaults to `GET`.                                     |
| `headers`  | object   | Header name → value. Optional.                         |
| `body`     | string   | Omit for no body.                                      |
| `encoding` | string   | `utf8` (default) or `base64` — how `body` is decoded.  |

### Output (stdout) — one JSON object

Branch on `ok`:

```json
{ "ok": true,  "response": { "status": 200, "headers": {}, "body": "...", "encoding": "utf8" } }
{ "ok": false, "error": { "kind": "threw", "message": "...", "stack": "..." } }
```

- `ok: true` — the handler **ran successfully**. An HTTP error status (404, 500)
  is still `ok: true`; it's a successful invocation that returned an error
  response.
- `ok: false` — the **invocation itself failed**. `error.kind` is one of
  `bad_input`, `import_failed`, `threw`, `bad_return`.
- `response.encoding` is `utf8` when the body is valid UTF-8 text, else `base64`.
- Exit code: `0` when `ok: true`, nonzero otherwise. **stdout JSON is the source
  of truth.**

## Input validation

If a handler exports `schema.input` (a Zod schema, see above), `run_request`
validates the request body against it **before calling the handler**:

- Body is parsed as JSON and checked against `schema.input`.
- On failure (missing/invalid fields, or non-JSON body) it returns an HTTP
  `400` response with `{ "error": "invalid input", "issues": [...] }` and the
  handler is never called. This is `ok: true` with `status: 400` — a successful
  invocation that refused bad input, not an invocation failure.
- Handlers with no `schema.input`, or whose `input` is not a Zod type, are
  called without validation.

So handlers can trust their input; the same Zod schema drives both `discover`
(model-facing contract) and runtime validation. Validation currently covers the
request **body** only — query/path params are not yet validated.

## Notes

- **Env / secrets**: set them in the process environment; handlers read
  `Bun.env` / `process.env` as usual.
- **Timeouts**: not built in — the parent process kills the invocation if needed
  (it's one process per request).
- **Streaming**: a streamed `Response` is fully buffered before output.

## discover — catalog handler contracts

Scan a folder of handlers and emit their I/O contracts as JSON Schema, ready to
drop into a tool-use / function-calling API:

```
bun discover.ts ./fixtures/catalog
```

```json
{
  "handlers": [
    { "name": "greet", "description": "Greet a user by name",
      "input_schema":  { "type": "object", "properties": { "name": { "type": "string" } }, "required": ["name"] },
      "output_schema": { "type": "object", "properties": { "greeting": { "type": "string" } }, "required": ["greeting"] } }
  ],
  "skipped": [
    { "name": "helpers", "reason": "not a handler (no default.fetch export)" },
    { "name": "undocumented", "reason": "handler missing schema export" }
  ]
}
```

- `name` = filename without `.ts` (the implied route, and a valid tool name).
- `handlers[].input_schema` maps directly onto Anthropic tool-use
  (`name` / `description` / `input_schema`) or OpenAI function definitions;
  `output_schema` is extra for your calling logic. Either is `null` when the
  Zod schema is not declared.
- `discover` never crashes on a bad file — every per-file problem (not a
  handler, missing/invalid `schema`, import error) becomes a `skipped` entry.
  It exits nonzero only when the folder itself is invalid.

## Develop

```
bun install
bun test
```
