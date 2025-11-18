export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initializeLangfuseInstrumentation } = await import(
      "@app/lib/api/instrumentation/init"
    );
    initializeLangfuseInstrumentation();
  }
}
