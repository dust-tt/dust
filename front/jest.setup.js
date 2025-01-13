import { fetch, Headers, Request, Response } from "node-fetch";
import { TextDecoder, TextEncoder } from "util";

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.Request = Request;
global.Response = Response;
global.Headers = Headers;
global.fetch = fetch;
