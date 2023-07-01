import { v4 as uuidv4 } from "uuid";

import { ChatMessage } from "@app/lib/models";

async function main() {
  const messages = await ChatMessage.findAll();

  const chunks = [];
  for (let i = 0; i < messages.length; i += 16) {
    chunks.push(messages.slice(i, i + 16));
  }

  for (let i = 0; i < chunks.length; i++) {
    console.log(`Processing chunk ${i}/${chunks.length}...`);
    const chunk = chunks[i];
    await Promise.all(
      chunk.map((m) => {
        return (async () => {
          if (!m.sId) {
            await m.update({
              sId: uuidv4(),
            });
          }
        })();
      })
    );
  }
}

main()
  .then(() => {
    console.log("Done");
    process.exit(0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
