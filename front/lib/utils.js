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
    icon: "/static/noun-artificial-intelligence-5255740.svg",
  },
  data: {
    name: "Data",
    icon: "/static/noun-analytics-5257465.svg",
  },
  code: {
    name: "JavaScript",
    icon: "/static/noun-javascript-1637023.svg",
  },
  search: {
    name: "Google Search",
    icon: "/static/noun-online-search-1625822.svg",
  },
  map_reduce: {
    name: "Map Reduce",
    icon: "/static/noun-parallel-processing-3383085.svg",
  },
  map: {
    name: "Map",
    icon: "/static/noun-parallel-processing-3383085.svg",
  },
  reduce: {
    name: "Reduce",
    icon: "/static/noun-parallel-processing-3383085.svg",
  },
  input: {
    name: "Input",
    icon: "/static/noun-input-2980167.svg",
  },
};

export const getDisplayNameForBlock = (blockType) => {
  if (!blockUiConfig[blockType]) return null;
  return blockUiConfig[blockType].name;
};

export const getIconForBlock = (blockType) => {
  if (!blockUiConfig[blockType]) return null;
  return blockUiConfig[blockType].icon;
};
