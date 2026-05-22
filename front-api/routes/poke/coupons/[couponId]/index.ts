import { pokeApp } from "@front-api/middleware/env";

import archive from "./archive";
import redemptions from "./redemptions";

// Mounted at /api/poke/coupons/:couponId.
const app = pokeApp();

app.route("/archive", archive);
app.route("/redemptions", redemptions);

export default app;
