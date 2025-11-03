export const CHAIN_OF_THOUGHT_META_PROMPT =
  "You must structure ALL your output using `<thinking>` and `<response>` tags:\n\n" +
  "RULES:\n" +
  "1. Use `<thinking>` tags for:\n" +
  "   - Planning which tool to use and why (1 bullet point before tool use)\n" +
  "   - Confirming if tool succeeded/failed (1 bullet point after tool use)\n" +
  "   - Do NOT repeat or summarize the tool's actual output\n\n" +
  "2. Use `<response>` tags for:\n" +
  "   - ONLY the final answer to the user\n" +
  '   - No tool names, no process descriptions, no "I used X to find Y"\n' +
  "EXAMPLES:\n\n" +
  "GOOD ✓:\n" +
  "User: What's the weather in Tokyo?\n" +
  "<thinking>\n" +
  "• Need weather_api tool for Tokyo weather\n" +
  "</thinking>\n" +
  "[uses weather_api]\n" +
  "<thinking>\n" +
  "• Got weather data successfully\n" +
  "</thinking>\n" +
  "<response>\n" +
  "[Your natural answer about the weather]\n" +
  "</response>\n\n" +
  "BAD ✗:\n" +
  "<thinking>\n" +
  "• Got result: 22°C, partly cloudy, humidity 65%, wind 10km/h\n" +
  "</thinking>\n\n" +
  "GOOD ✓ (Multiple tools):\n" +
  "User: Compare prices of iPhone 15 on Amazon and Best Buy\n" +
  "<thinking>\n" +
  "• Need web_scraper for Amazon prices\n" +
  "</thinking>\n" +
  "[uses web_scraper]\n" +
  "<thinking>\n" +
  "• Amazon data retrieved\n" +
  "</thinking>\n" +
  "<thinking>\n" +
  "• Need web_scraper for Best Buy prices\n" +
  "</thinking>\n" +
  "[uses web_scraper]\n" +
  "<thinking>\n" +
  "• Best Buy data retrieved\n" +
  "</thinking>\n" +
  "<response>\n" +
  "[Your comparison of the prices]\n" +
  "</response>\n\n" +
  "GOOD ✓ (Tool failure):\n" +
  "<thinking>\n" +
  "• Need database_query to get user stats\n" +
  "</thinking>\n" +
  "[uses database_query]\n" +
  "<thinking>\n" +
  "• Query failed - trying alternate approach\n" +
  "</thinking>\n\n" +
  "BAD ✗ (Wrong response format):\n" +
  "<response>\n" +
  "I'll check the weather for you. Let me use the weather API to find out...\n" +
  "According to my search, it's 22°C in Tokyo.\n" +
  "</response>\n\n" +
  "REMEMBER:\n" +
  "- Thinking = process tracking ONLY (not data logging)\n" +
  "- Keep bullets extremely brief\n" +
  "- Never mention tools or process in <response>\n" +
  "- Answer naturally without revealing the lookup process" +
  "- You must never output text outside of `<thinking>` tags between tool use." +
  " Only start writing in the main response body (in `<response>` tags) once you are done using tools and ready to write a final answer.";

export const CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [
    {
      openingPattern: "<thinking>",
      closingPattern: "</thinking>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<response>",
      closingPattern: "</response>",
      classification: "tokens" as const,
      swallow: false,
    },
  ],
};

export const DEEPSEEK_CHAIN_OF_THOUGHT_DELIMITERS_CONFIGURATION = {
  incompleteDelimiterPatterns: [/<\/?[a-zA-Z_]*$/],
  delimiters: [
    {
      openingPattern: "<think>",
      closingPattern: "</think>",
      classification: "chain_of_thought" as const,
      swallow: false,
    },
    {
      openingPattern: "<response>",
      closingPattern: "</response>",
      classification: "tokens" as const,
      swallow: false,
    },
  ],
};
