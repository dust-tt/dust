import { hash as blake3 } from "blake3/browser";
import { v4 as uuidv4 } from "uuid";

export const MODELS_STRING_MAX_LENGTH = 255;

export function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

export function new_id() {
  const u = uuidv4();
  const b = blake3(u);
  return Buffer.from(b).toString("hex");
}

export const shallowBlockClone = (block: any) => {
  const b = Object.assign({}, block);
  b.spec = Object.assign({}, block.spec);
  b.config = Object.assign({}, block.config || {});
  return b;
};

export const utcDateFrom = (millisSinceEpoch: number | string | Date) => {
  const d = new Date(millisSinceEpoch);
  return d.toUTCString();
};

export const timeAgoFrom = (millisSinceEpoch: number) => {
  // return the duration elapsed from the given time to now in human readable format (using seconds, minutes, days)
  const now = new Date().getTime();
  const diff = now - millisSinceEpoch;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);
  if (years > 0) {
    return years + "y";
  }
  if (months > 0) {
    return months + "m";
  }
  if (days > 0) {
    return days + "d";
  }
  if (hours > 0) {
    return hours + "h";
  }
  if (minutes > 0) {
    return minutes + "m";
  }
  return seconds + "s";
};

export const communityApps = [
  {
    user: "spolu",
    sId: "01caf5ebc3",
    wId: "3e26b0e764",
    name: "ipcc-ar6-qa",
    description:
      "Use semantic search to answer questions about the IPCC AR6 report",
    visibility: "public",
  },
  {
    user: "bcmejla",
    sId: "cc20d98f70",
    wId: "9fff4af13d",
    name: "wedding-thank-yous",
    description: "Solving the blank page problem for wedding thank you notes",
    visibility: "public",
  },
  {
    user: "spolu",
    sId: "2316f9c6b0",
    wId: "3e26b0e764",
    name: "web-search-assistant",
    description:
      "Answer questions with high factual accuracy by searching online and compiling responses based on content downloaded from websites (with references).",
    visibility: "public",
  },
  {
    user: "spolu",
    sId: "d12ac33169",
    wId: "3e26b0e764",
    name: "maths-generate-code",
    description: "Generate code to answer maths questions",
    visibility: "public",
  },
  {
    user: "spolu",
    sId: "b39f8e9023",
    wId: "3e26b0e764",
    name: "toolbot-repro",
    description:
      "Teach LLM to teach itself new tasks by teaching it to generate few shot examples from high-level tasks descriptions and prompting itself with them.",
    visibility: "public",
  },
];

export const validateUrl = (
  urlString: string
): {
  valid: boolean;
  standardized: string | null;
} => {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch (e) {
    return { valid: false, standardized: null };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { valid: false, standardized: null };
  }

  return { valid: true, standardized: url.href };
};

// from http://emailregex.com/
const EMAIL_REGEX =
  /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

export const isEmailValid = (email: string | null): boolean => {
  if (!email) {
    return false;
  }
  return EMAIL_REGEX.test(email);
};
