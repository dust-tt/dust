import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const payload: BetaMessageStreamParams = {
  model: "claude-sonnet-4-5-20250929",
  thinking: {
    type: "disabled",
  },
  system: [
    {
      type: "text",
      text: "You are a helpful assistant.",
      cache_control: {
        type: "ephemeral",
      },
    },
  ],
  messages: [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "<dust_system>\n- Sender: Pierre Milliotte (:mention_user[Pierre Milliotte]{sId=oZujjEmhUC}) <pierre@dust.tt>\n- Conversation: jH9X8WvHys\n- Sent at: Apr 01, 2026, 16:58:33 GMT+2\n- Source: web\n</dust_system>\n\n@claude-4.5-sonnet get me the weather in paris",
        },
      ],
    },
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "<thinking>\n- User wants weather information for Paris, which is current data that requires a web search\n</thinking>",
        },
        {
          type: "tool_use",
          id: "toolu_011cQU9EHVRUKHrtYrVUnGfj",
          name: "web_search_browse__websearch",
          input: {
            query: "weather in Paris today",
          },
        },
      ],
    },
    {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_011cQU9EHVRUKHrtYrVUnGfj",
          content:
            '[{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Cloudy with occasional light rain...mainly this evening. Low 43F. Winds NNW at 5 to 10 mph. Chance of rain 60%.","title":"Weather Forecast and Conditions for Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ekx"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/paris/623/weather-forecast/623","text":"Hourly Weather · 1 PM 53°. rain drop 7% · 2 PM 53°. rain drop 7% · 3 PM 53°. rain drop 7% · 4 PM 53°. rain drop 7% · 5 PM 54°. rain drop 7% · 6 PM 54°. rain drop 7%.","title":"Paris, Ville de Paris, France Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"n1k"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/tenday/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Today. 54° / 48°. AM Showers. 33%. 7 mph ... A few showers this morning with overcast skies during the afternoon hours. High 54F. Winds NNW at 5 to 10 mph. Chance ...","title":"10-Day Weather Forecast for Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"g8q"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/hourbyhour/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Hourly Weather Paris, France · as of 5:00 PM PDT · 10 am. 52°. Cloudy. 15%. 15%. 86%. 4 mph. 0 in · 11 am. 54°. Cloudy. 15%. 15%. 81%. 4 mph. 0 in · 12 pm. 55°.","title":"Hourly Weather Forecast for Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"duj"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/forecast/fr/paris","text":"Paris Weather Forecasts. Weather Underground provides local & long-range weather forecasts, weatherreports, maps & tropical weather conditions for the Paris ...","title":"Paris, France 10-Day Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"sil"}},{"type":"resource","resource":{"uri":"https://weather.yahoo.com/fr/ile-de-france/paris/","text":"Cloudy today with a high of 57°F and a low of 47°F.","title":"Paris, FR Weather Forecast, Conditions, and Maps","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"aqj"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/france/paris","text":"Forecast for the next 48 hours ; Paris-Orly: (9 mi). Drizzle. Fog. ; Paris-Aeroport Charles De Gaulle: (14 mi). Fog. (1 hour ago) ; Melun Airport: (22 mi). Drizzle ...","title":"Weather for Paris, Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cvs"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/tenday/l/a5c27da38afe789545e3446ede0bfd5042030764469a6cd4fff4e9468c74d2a7","text":"Today. 53° / 47°. Mostly Cloudy. 24%. 8 mph ... Mainly cloudy. Slight chance of a rain shower. High 53F. Winds NNW at 5 to 10 mph. ... Cloudy. Low 47F. Winds NNW at ...","title":"10-Day Weather Forecast for Paris, Île-de-France, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"a31"}},{"type":"resource","resource":{"uri":"https://www.theweathernetwork.com/en/city/fr/ile-de-france/paris/current","text":"H: 12° L: 8°. Hourly. Full 72 hours · 1pm. Cloudy with showers. 10°. Feels 9. POP. 60%. 0.1mm. 2pm. Cloudy with showers. 11°. Feels 10. POP. 70%. 0.2mm.","title":"Paris, IDF, FR Current Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"eks"}},{"type":"resource","resource":{"uri":"https://www.weatherbug.com/weather-forecast/now/paris-ile-del-france-fr","text":"Today ... Mostly cloudy. High temperature around 55F. Dew point will be around 46F with an average humidity of 77%. Winds will be 4 mph from the NW.","title":"Paris, Ile-del-France, FR Weather Today & Tomorrow - WeatherBug","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bpe"}},{"type":"resource","resource":{"uri":"https://weather.metoffice.gov.uk/forecast/u09tvnxyj","text":"Today Today. Light rain;. 12° Maximum daytime temperature: 12 degrees Celsius; 9° Minimum nighttime temperature: 9 degrees Celsius; · Thu Thursday. Cloudy; · Fri ...","title":"Paris (France) weather - Met Office","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"dba"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/paris/623/hourly-weather-forecast/623","text":"RealFeel Shade™51°. WindENE 6 mph. Air QualityPoor. Max UV Index1.2 (Low). Wind Gusts15 mph. Humidity77%. Indoor Humidity45% (Ideal Humidity).","title":"Paris, Ville de Paris, France Hourly Weather - AccuWeather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cx6"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/d2a540efb4e9604b3c1d01b7851a1d9d2ab4c7b3ba428e5799936ac54404c035","text":"Today\'s Activities Forecast. Lower chances of showers will make early evening a preferred time for getting outside for the rest of the day.","title":"Weather Forecast and Conditions for Paris, Île-de-France, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ch7"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/02144e9a9a2fe048b3ecca9df91501293f98ee712846f78a5da25ba6690fd98c","text":"Clearing skies after some evening rain. Low 37F. Winds NNW at 10 to 15 mph. Chance of rain 90%. Humidity.","title":"Weather Forecast and Conditions for Paris, France | weather.com","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"as8"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/weather/fr/paris","text":"Cloudy this morning. A few showers developing during the afternoon. High 54F. Winds light and variable. Chance of rain 30%. icon. Tonight ...","title":"Paris, France Weather Conditions | Weather Underground","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"drk"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/france/paris/hourly","text":"Hour-by-hour Forecast in Paris — Graph ... Scattered clouds. Feels Like: 41 °F. Humidity: 88%. Precipitation: Rain: ...","title":"Hourly forecast for Paris, Paris, France - Weather - Time and Date","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bs0"}}]',
        },
      ],
    },
  ],
  temperature: 1,
  tools: [
    {
      name: "web_search_browse__websearch",
      description:
        "A tool that performs a Google web search based on a string query.",
      input_schema: {
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
    },
    {
      name: "web_search_browse__webbrowser",
      description:
        "A tool to browse websites, you can provide a list of up to 16 urls to browse all at once.",
      input_schema: {
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
            description: "If true, also retrieve outgoing links from the page.",
          },
        },
        required: ["urls"],
        additionalProperties: false,
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
    {
      name: "common_utilities__generate_random_number",
      description:
        "Generate a random positive number between 1 and the provided maximum (inclusive).",
      input_schema: {
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
    },
    {
      name: "common_utilities__generate_random_float",
      description:
        "Generate a random floating point number between 0 (inclusive) and 1 (exclusive).",
      input_schema: {
        type: "object",
        properties: {},
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
    {
      name: "common_utilities__wait",
      description:
        "Pause execution for the provided number of milliseconds (maximum 180000).",
      input_schema: {
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
    },
    {
      name: "common_utilities__get_current_time",
      description:
        "Return the current date and time in multiple convenient formats.",
      input_schema: {
        type: "object",
        properties: {
          include_formats: {
            type: "array",
            items: {
              type: "string",
              enum: ["iso", "utc", "timestamp", "locale"],
              description: "Specify which formats to return. Defaults to all.",
            },
            maxItems: 4,
          },
        },
        additionalProperties: false,
        $schema: "http://json-schema.org/draft-07/schema#",
      },
    },
    {
      name: "common_utilities__math_operation",
      description: "Perform mathematical operations.",
      input_schema: {
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
    },
    {
      name: "skill_management__enable_skill",
      description:
        "Enable a skill for the current conversation. The skill will be available for subsequent messages from the same agent in this conversation.",
      input_schema: {
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
    },
  ],
  max_tokens: 64000,
  tool_choice: {
    type: "auto",
  },
  stream: true,
  betas: ["structured-outputs-2025-11-13"],
  cache_control: {
    type: "ephemeral",
  },
} as BetaMessageStreamParams;

const client = new Anthropic({
  apiKey: process.env.DUST_MANAGED_ANTHROPIC_API_KEY,
});

const call = async () => {
  const events = client.beta.messages.stream(payload);

  const logEvents = [];

  for await (const event of events) {
    logEvents.push(event);
  }
  await fs.promises.writeFile(
    path.join(__dirname, `anthropic_events_${Date.now().toString()}.json`),
    JSON.stringify(logEvents, null, 2),
    "utf8"
  );
};

call();
