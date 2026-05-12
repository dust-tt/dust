import type { GenerateContentParameters } from "@google/genai";
import { GoogleGenAI } from "@google/genai";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const params: GenerateContentParameters = {
  model: "gemini-3-pro-preview",
  contents: [
    {
      role: "user",
      parts: [
        {
          text: "<dust_system>\n- Sender: Pierre Milliotte (:mention_user[Pierre Milliotte]{sId=oZujjEmhUC}) <pierre@dust.tt>\n- Conversation: rYahuhjE5P\n- Sent at: Apr 01, 2026, 17:01:32 GMT+2\n- Source: web\n</dust_system>\n\n@gemini-pro get me the weather in paris",
        },
      ],
    },
    {
      role: "model",
      parts: [
        {
          text: "**Initiating the Inquiry**\n\nI've grasped the user's intent: they want Paris's current weather. My next step involves selecting the appropriate tool. It looks like `web_search_browse__websearch` will be the go-to resource for fetching this real-time data.\n\n\n",
          thought: true,
          thoughtSignature: "",
        },
        {
          functionCall: {
            id: "kph3bwtd",
            name: "web_search_browse__websearch",
            args: {
              query: "current weather in Paris",
            },
          },
          thoughtSignature:
            "EpMECpAEAb4+9vs6OxSWR88lfg/dasncDkmITE7C0Bc0HAho2w4ywuaxIuHG6EkKqI9qM4uamFDfG8RrRO+B2DajJNNOadq7FVY+CQQa9qtC7/B6cEIJbspOmV0lCmBaTGnGzKKYjsabfUaZKTO0/QUKPrroXaCgTx/Pmm1EGM3bwGLXHrrnJ1G3l3GJx2MbPvGq3zzu+0LESyvvjdqh8cb9wbrB8QVd678/qrklWdny1tMTgeWhlQa5ve9zpfxHEjS4+SWASSXB8xP5uzRMuGrn86ZazbfJCeosvzh8tM4k+yjWEvREcOcCULbN9ZpT655g2gLBYCXYPmQRQ6TWkSDSdq6n0E/aTQAFDVMzyZLZey/Qb++Ujocqsr4SG0+CqZ58cJdKBsPvKcuwIlvEweo0kLKllbATX5yweKNZEYIyzacgMZlP6/CC/Rto4HS7Ce3qm6sdeb7UDCM0wr0a6jXLuiXyyIWDskOen5FsQVO97e8rq9KyMbRYnrgreHAonhnFEopp+lb2hYEdB7lm4vaj3CWvFvuB9MR880Jnv2SUb81l1oobJmMftAFezzSKqiweJWc6yWnWzxQWqyl4fFynJuDXWdu7v+2auboRCrfvnX+Ir+rQnc0/BRnF0JqkEAsMtRO167r2x6Dr7T8zPvMRJJl86UDsKVVJ116T68un0EcDGjgYwF72uNLYczHUrwvdaL+0",
        },
      ],
    },
    {
      role: "user",
      parts: [
        {
          functionResponse: {
            response: {
              output:
                '[{"type":"resource","resource":{"uri":"https://weather.com/weather/today/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Cloudy with occasional light rain...mainly this evening. Low 43F. Winds NNW at 5 to 10 mph. Chance of rain 60%.","title":"Weather Forecast and Conditions for Paris, France | weather.com","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ekx"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/paris/623/weather-forecast/623","text":"Hourly Weather · 1 PM 53°. rain drop 7% · 2 PM 53°. rain drop 7% · 3 PM 53°. rain drop 7% · 4 PM 53°. rain drop 7% · 5 PM 54°. rain drop 7% · 6 PM 54°. rain drop 7%.","title":"Paris, Ville de Paris, France Weather Forecast - AccuWeather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"n1k"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/tenday/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Today. 54° / 48°. AM Showers. 33%. 7 mph ... A few showers this morning with overcast skies during the afternoon hours. High 54F. Winds NNW at 5 to 10 mph. Chance ...","title":"10-Day Weather Forecast for Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"g8q"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/forecast/fr/paris","text":"Paris Weather Forecasts. Weather Underground provides local & long-range weather forecasts, weatherreports, maps & tropical weather conditions for the Paris ...","title":"Paris, France 10-Day Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"duj"}},{"type":"resource","resource":{"uri":"https://www.theweathernetwork.com/en/city/fr/ile-de-france/paris/current","text":"H: 12° L: 8°. Hourly. Full 72 hours · 1pm. Cloudy with showers. 10°. Feels 9. POP. 60%. 0.1mm. 2pm. Cloudy with showers. 11°. Feels 10. POP. 70%. 0.2mm.","title":"Paris, IDF, FR Current Weather - The Weather Network","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"sil"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/france/paris","text":"Current weather in Paris and forecast for today, tomorrow, and next 14 days.","title":"Weather for Paris, Paris, France - Time and Date","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"aqj"}},{"type":"resource","resource":{"uri":"https://weather.yahoo.com/fr/ile-de-france/paris/","text":"Cloudy today with a high of 55°F and a low of 46°F.","title":"Paris, FR Weather Forecast, Conditions, and Maps","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cvs"}},{"type":"resource","resource":{"uri":"https://weather.metoffice.gov.uk/forecast/u09tvnxyj","text":"Today Today. Light rain;. 12° Maximum daytime temperature: 12 degrees Celsius; 9° Minimum nighttime temperature: 9 degrees Celsius; · Thu Thursday. Cloudy; · Fri ...","title":"Paris (France) weather - Met Office","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"a31"}},{"type":"resource","resource":{"uri":"https://weather.com/weather/hourbyhour/l/1a8af5b9d8971c46dd5a52547f9221e22cd895d8d8639267a87df614d0912830","text":"Hourly Weather Paris, France · as of 5:00 PM PDT · 10 am. 52°. Cloudy. 15%. 15%. 86%. 4 mph. 0 in · 11 am. 54°. Cloudy. 15%. 15%. 81%. 4 mph. 0 in · 12 pm. 55°.","title":"Hourly Weather Forecast for Paris, France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"eks"}},{"type":"resource","resource":{"uri":"https://www.bbc.com/weather/2988507","text":"14-day weather forecast for Paris.","title":"Paris - BBC Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bpe"}},{"type":"resource","resource":{"uri":"https://www.accuweather.com/en/fr/paris/623/hourly-weather-forecast/623","text":"2 PM ... Light jacket or sweater may be appropriate. LEARN MORE. rain drop 7%. Cloudy. RealFeel Shade™51°. WindENE 6 mph. Air QualityPoor. Max ...","title":"Paris, Ville de Paris, France Hourly Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"dba"}},{"type":"resource","resource":{"uri":"https://www.weatherbug.com/weather-forecast/now/paris-ile-del-france-fr","text":"Today ... Mostly cloudy. High temperature around 55F. Dew point will be around 46F with an average humidity of 77%. Winds will be 4 mph from the NW.","title":"Paris, Ile-del-France, FR Weather Today & Tomorrow","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"cx6"}},{"type":"resource","resource":{"uri":"https://www.yr.no/en/forecast/hourly-table/2-2988507/France/%C3%8Ele-de-France%20Region/Paris%20Department/Paris?i=0","text":"Thursday 2 Apr. · Night: cloudy · Morning: cloudy · Afternoon: light rain showers · Evening: partly cloudy. Maximum minimum temperature:14°/7°. Precipitation ...","title":"Yr - Paris - Hourly weather forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"ch7"}},{"type":"resource","resource":{"uri":"https://www.theweathernetwork.com/en/city/fr/ile-de-france/paris/14-days","text":"Mainly cloudy; light rain in the morning, then a few showers in the afternoon. Night. Partly cloudy. 4. °. Feels 4. Wind. Wind Gust. Humidity. 15 km/h N.","title":"Paris, IDF, FR 14 Days Weather","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"as8"}},{"type":"resource","resource":{"uri":"https://www.wunderground.com/hourly/fr/paris","text":"Showers following some early drizzle. High 54F. Winds light and variable. Chance of rain 60%. Sun. 7:32AM. 8:19PM. Moon.","title":"Paris, France Hourly Weather Forecast","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"drk"}},{"type":"resource","resource":{"uri":"https://www.timeanddate.com/weather/france/paris/ext","text":"Night Sky · TodayHourly14 DaysPastClimate. Currently: 48 °F. Fog. (Weather station: Villacoublay, France). See more current weather ... Paris time - Weather by ...","title":"Paris 14 Day Extended Forecast - France","mimeType":"application/vnd.dust.tool-output.websearch-result","reference":"bs0"}}]',
            },
            name: "web_search_browse__websearch",
            id: "kph3bwtd",
          },
        },
      ],
    },
  ],
  config: {
    temperature: 1,
    tools: [
      {
        functionDeclarations: [
          {
            name: "web_search_browse__websearch",
            description:
              "A tool that performs a Google web search based on a string query.",
            parametersJsonSchema: {
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
        ],
      },
      {
        functionDeclarations: [
          {
            name: "web_search_browse__webbrowser",
            description:
              "A tool to browse websites, you can provide a list of up to 16 urls to browse all at once.",
            parametersJsonSchema: {
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
          },
        ],
      },
      {
        functionDeclarations: [
          {
            name: "common_utilities__get_current_time",
            description:
              "Return the current date and time in multiple convenient formats.",
            parametersJsonSchema: {
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
          },
        ],
      },
    ],
    systemInstruction: {
      text: 'You are a helpful assistant.',
    },
    candidateCount: 1,
    thinkingConfig: {
      thinkingBudget: 1024,
      includeThoughts: true,
    },
  },
} as GenerateContentParameters;

const client = new GoogleGenAI({
  apiKey: process.env.DUST_MANAGED_GOOGLE_AI_STUDIO_API_KEY,
});

const call = async () => {
  const generateContentResponses =
    await client.models.generateContentStream(params);

  const logEvents = [];

  for await (const event of generateContentResponses) {
    logEvents.push(event);
  }
  await fs.promises.writeFile(
    path.join(__dirname, `google_events_${Date.now().toString()}.json`),
    JSON.stringify(logEvents, null, 2),
    "utf8"
  );
};

call();
