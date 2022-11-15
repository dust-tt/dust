import { v4 as uuidv4 } from "uuid";
import { hash as blake3 } from "blake3";

export function classNames(...classes) {
  return classes.filter(Boolean).join(" ");
}

export function new_id() {
  let u = uuidv4();
  let b = blake3(u);
  return Buffer.from(b).toString("hex");
}

export const shallowBlockClone = (block) => {
  let b = Object.assign({}, block);
  b.spec = Object.assign({}, block.spec);
  b.config = Object.assign({}, block.config || {});
  return b;
};

export const communityApps = [
  {
    user: "spolu",
    sId: "d12ac33169",
    name: "maths-generate-code",
    description: "Generate code to answer maths questions",
    visibility: "public",
  },
  {
    user: "bcmejla",
    sId: "cc20d98f70",
    name: "wedding-thank-yous",
    description: "Solving the blank page problem for wedding thank you notes",
    visibility: "public",
  },
  {
    user: "spolu",
    sId: "2316f9c6b0",
    name: "web-search-assistant",
    description:
      "Answer questions with high factual accuracy by searching online and compiling responses based on content downloaded from websites (with references).",
    visibility: "public",
  },
  {
    user: "spolu",
    sId: "b39f8e9023",
    name: "toolbot-repro",
    description:
      "Teach LLM to teach itself new tasks by teaching it to generate few shot examples from high-level tasks descriptions and prompting itself with them.",
    visibility: "public",
  },
];
