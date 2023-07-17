import fs from "fs";

// print current directory
const data = JSON.parse(fs.readFileSync(".local/time-test.json").toString());

const newData = data.map((d: any) => {
  return {
    context: {
      user: {
        username: "spolu",
        full_name: "Stanislas Polu",
      },
      workspace: "dust",
      date_today: "2023-07-13",
    },
    messages: [
      {
        role: "user",
        message: d.question,
      },
    ],
    expected: d.expected,
  };
});
// print newData as JSONL
console.log(newData.map((d: any) => JSON.stringify(d)).join("\n"));
