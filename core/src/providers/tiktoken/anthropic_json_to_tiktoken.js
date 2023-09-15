const fs = require("fs");

// for https://github.com/anthropics/anthropic-tokenizer-typescript/blob/main/claude.json

// Read the JSON file
fs.readFile("anthropic_base.tiktoken.json", "utf8", (err, data) => {
  if (err) {
    console.error(err);
    return;
  }

  // Parse the JSON
  const json = JSON.parse(data);

  // Split the 'bpe_ranks' field by space
  const ranks = json.bpe_ranks.split(" ");

  // Prepare the output
  let output = "";
  for (let i = 0; i < ranks.length; i++) {
    output += `${ranks[i]} ${i + 5}\n`;
  }

  // Write the output to a new file
  fs.writeFile("anthropic_base.tiktoken", output, (err) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log("File has been created");
  });
});
