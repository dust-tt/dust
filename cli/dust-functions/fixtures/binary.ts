export default {
  async fetch(_req: Request): Promise<Response> {
    const bytes = new Uint8Array([0xff, 0xfe, 0x00, 0x42]);
    return new Response(bytes, {
      headers: { "content-type": "application/octet-stream" },
    });
  },
};
