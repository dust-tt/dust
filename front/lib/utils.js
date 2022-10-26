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

const blockUiConfig = {
  llm: {
    name: "Large Language Model (LLM)",
  },
  data: {
    name: "Data",
  },
  code: {
    name: "JavaScript",
  },
  search: {
    name: "Google Search",
  },
  map_reduce: {
    name: "Map Reduce",
  },
  map: {
    name: "Map",
  },
  reduce: {
    name: "Reduce",
  },
  input: {
    name: "Input",
  },
};

export const getDisplayNameForBlock = (blockType) => {
  if (!blockUiConfig[blockType]) return null;
  return blockUiConfig[blockType].name;
};
