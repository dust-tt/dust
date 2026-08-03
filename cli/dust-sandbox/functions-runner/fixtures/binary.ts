export default {
  async fetch(_req: Request): Promise<Response> {
    return new Response(new Uint8Array([0xff, 0xfe, 0x00, 0x42]), {
      headers: { "content-type": "application/octet-stream" },
    });
  },
};
