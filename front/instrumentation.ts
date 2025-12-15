export async function register() {
  // registerOTel({
  //   serviceName: "dust-front",
  //   // No exporter needed, we just want context.
  // });

  // TODO(2025-11-25 flav) Add Langfuse back.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation.node");
  }
}
