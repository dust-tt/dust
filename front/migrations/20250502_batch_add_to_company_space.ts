import { getDustDataSourcesBucket } from "@app/lib/file_storage";
import { makeScript } from "@app/scripts/helpers";

makeScript({}, async () => {
  const files = await getDustDataSourcesBucket().getFiles({
    prefix: "34579",

  });
  console.log(`got ${files.length} files`);
});
