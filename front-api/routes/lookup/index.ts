import { createHono } from "@front-api/lib/hono";
import resource from "./[resource]";
import coupons from "./coupons";

const app = createHono();
app.route("/coupons", coupons);
app.route("/:resource", resource);

export default app;
