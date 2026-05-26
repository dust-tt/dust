import { publicApiApp } from "@front-api/middlewares/ctx";

import answerQuestion from "./answer-question";
import edit from "./edit";
import feedbacks from "./feedbacks";
import retry from "./retry";
import validateAction from "./validate-action";

// Mounted at /api/v1/w/:wId/assistant/conversations/:cId/messages/:mId.
const app = publicApiApp();

app.route("/answer-question", answerQuestion);
app.route("/edit", edit);
app.route("/feedbacks", feedbacks);
app.route("/retry", retry);
app.route("/validate-action", validateAction);

export default app;
