import { Mistral } from "@mistralai/mistralai";
import type { ChatCompletionStreamRequest } from "@mistralai/mistralai/models/components";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payload: ChatCompletionStreamRequest = {
  model: "mistral-large-latest",
  messages: [
    {
      role: "system",
      content:
        'You are a helpful assistant.',
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "<dust_system>\n- Sender: Pierre Milliotte (:mention_user[Pierre Milliotte]{sId=oZujjEmhUC}) <pierre@dust.tt>\n- Conversation: 1LkzNYObhm\n- Sent at: Apr 01, 2026, 17:00:46 GMT+2\n- Source: web\n</dust_system>\n\n@mistral get me the weather in paris",
        },
      ],
    },
    {
      role: "assistant",
      toolCalls: [
        {
          id: "9Wi7e8G56",
          function: {
            name: "web_search_browse__websearch",
            arguments: '{"query":"weather in Paris April 1 2026"}',
          },
        },
      ],
    },
    {
      role: "tool",
      content:
        '[{"type":"resource","resource":{"uri":"https://world-weather.info/forecast/france/paris/april-2026/","text":"Weather in Paris in April 2026. Paris Weather Forecast for April 2026 is ... Wednesday, 1 April. Day. +63°. 7.6. 30.4. 49%. +54°. 07:27 AM. 08:21 PM. Waxing ...","title":"Weather in Paris in April 2026 (Île-de-France) - World-Weather.info","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/europe/2608434/april-weather/2608434","text":"Get the monthly weather forecast for Europe, Ville de Paris, France, including daily high/low, historical averages, to help you plan ahead.","title":"2026 - Europe, Ville de Paris, France Monthly Weather | AccuWeather","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.weather25.com/europe/france/ile-de-france/paris?page=month&month=April","text":"The temperatures in Paris in April are quite cold with temperatures between 44°F and 60°F, warm clothes are a must. You can expect about 3 to 8 days of rain ...","title":"Paris weather in April 2026 | Paris 14 day weather - Weather25.com","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.facebook.com/WeatherAvenue/videos/paris-2026-1-april-2026s-weather-patchy-rain-nearby-8c/1298827858876530/","text":"Paris 2026: 1 April 2026\'s weather (Patchy rain nearby, 8°C) · 🌧️ 1 April 2026\'s weather in Paris: Patchy rain nearby. Rain 0 mm. Stay informed. # ...","title":"1 April 2026\'s weather in Paris: Patchy rain nearby. Rain 0 mm. Stay ...","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://en.climate-data.org/europe/france/ile-de-france/paris-44/t/april-4/","text":"The average temperature during this month is around 51.3°F (10.7°C), providing a mild and pleasant climate that is ideal for exploring the city\'s outdoor ...","title":"Weather Paris in April 2026: Temperature & Climate","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.predictwind.com/weather/france/le-de-france/paris/april","text":"The weather in this month is generally cool, with calm conditions and a dry climate. Temperature Trend (°C).","title":"Paris, France (april 2026) - Historical Weather - PredictWind","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://polymarket.com/event/highest-temperature-in-paris-on-april-1-2026","text":"The current frontrunner for \\"Highest temperature in Paris on April 1?\\" is \\"13°C\\" at 45%, meaning the market assigns a 45% chance to that outcome ...","title":"Highest temperature in Paris on April 1? - Polymarket","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.weather2travel.com/france/paris/april/","text":"Expect daytime maximum temperatures of 14°C in Paris, France in April based on long-term weather averages. There are 6 hours of sunshine per day on average.","title":"Paris weather in April 2026 | France: How hot? - Weather2Travel.com","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.parisdiscoveryguide.com/paris-in-april.html","text":"Although the average high temperature in Paris in April is 62°F (17°C) and the average low is 45°F (7°C), keep in mind that those are averages. When planning ...","title":"Best Things to Do in Paris in April 2026","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.weathertab.com/en/c/04/republic-of-france/ile-de-france/paris/","text":"Paris, Île-de-France Daily Weather Forecast for April 2026 ; 1. Wed. 75%. 51 to 61 °F 36 to 46 °F 8 to 18 °C 0 to 10 °C · Sunrise 7:28AM. Sunset 8:21PM. Waxing ...","title":"April 2026 Daily Weather Forecast for Paris, Île-de-France – Plan ...","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.holiday-weather.com/paris/averages/april/","text":"Daily highs tend to range from 13°C to 17°C throughout April, only exceeding 23°C or falling below 8°C one day out of every ten. Daily low temperatures ...","title":"Paris, Weather for April, France","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/eiffel-tower/70427_poi/april-weather/70427_poi","text":"Get the monthly weather forecast for Eiffel Tower, Ville de Paris, France, including daily high/low, historical averages, to help you plan ahead.","title":"Eiffel Tower, Ville de Paris, France Monthly Weather | AccuWeather","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.easeweather.com/europe/france/ile-de-france/paris/april","text":"The forecast for the first days of April 2026 in Paris predicts temperatures to be around 13 °C, close to the historical average. · In general, the average ...","title":"Weather in Paris in April 2026 - Detailed Forecast - EaseWeather","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://weatherspark.com/h/m/47913/2026/1/Historical-Weather-in-January-2026-in-Paris-France","text":"This report shows the past weather for Paris, providing a weather history for January 2026. It features all historical weather data series we have available, ...","title":"Paris January 2026 Historical Weather Data (France)","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://en.climate-data.org/europe/france-216/c/april-4/","text":"High temperatures in the first ten days average 15.7°C | 60.3°F, with lows at 3.9°C | 39°F. Mid-month highs rise to 16.3°C | 61.3°F, and lows to 4.7°C | 40.5°F.","title":"Weather France in April 2026: Temperature & Climate","mimeType":"application/vnd.dust.tool-output.websearch-result"}},{"type":"resource","resource":{"uri":"https://www.sortiraparis.com/en/news/in-paris/articles/342044-weather-in-paris-and-ile-de-france-will-the-springtime-weather-persist","text":"Temperatures will stay steady between 16 and 17°C, staying well above the seasonal average, which typically hovers around 10 to 13°C in March ...","title":"Weather in Paris and Île-de-France: Will the springlike conditions last?","mimeType":"application/vnd.dust.tool-output.websearch-result"}}]',
      name: "web_search_browse__websearch",
      toolCallId: "9Wi7e8G56",
    },
  ],
  temperature: 0.7,
  toolChoice: "auto",
  tools: [
    {
      type: "function",
      function: {
        name: "web_search_browse__websearch",
        description:
          "A tool that performs a Google web search based on a string query.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description:
                "The query used to perform the Google search. If requested by the user, use the Google syntax `site:` to restrict the search to a particular website or domain.",
            },
          },
          required: ["query"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "web_search_browse__webbrowser",
        description:
          "A tool to browse websites, you can provide a list of up to 16 urls to browse all at once.",
        parameters: {
          type: "object",
          properties: {
            urls: {
              type: "array",
              items: {
                type: "string",
              },
              maxItems: 16,
              description: "List of urls to browse (max: 16)",
            },
            screenshotMode: {
              type: "string",
              enum: ["none", "viewport", "fullPage"],
              description:
                "Screenshot mode: 'none' (default), 'viewport', or 'fullPage'.",
            },
            links: {
              type: "boolean",
              description:
                "If true, also retrieve outgoing links from the page.",
            },
          },
          required: ["urls"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "common_utilities__generate_random_number",
        description:
          "Generate a random positive number between 1 and the provided maximum (inclusive).",
        parameters: {
          type: "object",
          properties: {
            max: {
              type: "integer",
              exclusiveMinimum: 0,
              description:
                "Upper bound for the generated integer. Defaults to 1000000.",
            },
          },
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "common_utilities__generate_random_float",
        description:
          "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
        parameters: {
          type: "object",
          properties: {},
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "common_utilities__wait",
        description:
          "Pause execution for the provided number of milliseconds (maximum 180000).",
        parameters: {
          type: "object",
          properties: {
            duration_ms: {
              type: "integer",
              exclusiveMinimum: 0,
              maximum: 180000,
              description: "The time to wait in milliseconds, up to 3 minutes.",
            },
          },
          required: ["duration_ms"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "common_utilities__get_current_time",
        description:
          "Return the current date and time in multiple convenient formats.",
        parameters: {
          type: "object",
          properties: {
            include_formats: {
              type: "array",
              items: {
                type: "string",
                enum: ["iso", "utc", "timestamp", "locale"],
                description:
                  "Specify which formats to return. Defaults to all.",
              },
              maxItems: 4,
            },
          },
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "common_utilities__math_operation",
        description: "Perform mathematical operations.",
        parameters: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description: "The expression to evaluate. ",
            },
          },
          required: ["expression"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
    {
      type: "function",
      function: {
        name: "skill_management__enable_skill",
        description:
          "Enable a skill for the current conversation. The skill will be available for subsequent messages from the same agent in this conversation.",
        parameters: {
          type: "object",
          properties: {
            skillName: {
              type: "string",
              description: "The name of the skill to enable",
            },
          },
          required: ["skillName"],
          additionalProperties: false,
          $schema: "http://json-schema.org/draft-07/schema#",
        },
        strict: false,
      },
    },
  ],
  stream: true,
} as ChatCompletionStreamRequest;

const client = new Mistral({
  apiKey: process.env.DUST_MANAGED_MISTRAL_API_KEY,
});

const call = async () => {
  const completionEvents = await client.chat.stream(payload);

  const logEvents = [];

  for await (const event of completionEvents) {
    logEvents.push(event);
  }
  await fs.promises.writeFile(
    path.join(__dirname, `mistral_events_${Date.now().toString()}.json`),
    JSON.stringify(logEvents, null, 2),
    "utf8"
  );
};

call();
