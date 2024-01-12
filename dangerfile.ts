import { danger, warn } from "danger";

const modifiedModels = danger.git.modified_files.filter((path) => {
  return (
    path.startsWith("front/lib/models/") ||
    path.startsWith("connectors/src/lib/models/")
  );
});

if (modifiedModels.length > 0) {
  warn(
    "Files in `front/lib/models/` or `connectors/src/lib/models/` have been modified. A migration is required!"
  );
}
