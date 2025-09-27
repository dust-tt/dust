import { SpeechClient } from "@google-cloud/speech";
import { google } from "@google-cloud/speech/build/protos/protos";
import fs from "fs";
import {
  AudioConfig,
  AudioInputStream,
  AutoDetectSourceLanguageConfig,
  SpeechConfig,
  SpeechRecognizer,
} from "microsoft-cognitiveservices-speech-sdk";
import type { Logger } from "pino";

import config from "@app/lib/api/config";
import { makeScript } from "@app/scripts/helpers";
import { dustManagedCredentials } from "@app/types";
import StreamingRecognizeResponse = google.cloud.speech.v1.StreamingRecognizeResponse;

makeScript(
  {
    provider: {
      type: "string",
      demandOption: true,
      description: "Provider to use: azure, gcloud",
    },
  },
  async ({ provider }, logger) => {
    // const filename = "/Users/rcs/Downloads/gims.wav";
    const filename = "/Users/rcs/Downloads/rso28nio9503bwhuc29bhz4r8.wav";
    switch (provider) {
      case "azure":
        await azure(filename, logger);
        return;
      case "gcloud":
        await gcloud(filename, logger);
        return;
      default:
        throw new Error("Invalid provider " + provider);
    }
  }
);

const azure = (filename: string, logger: Logger) => {
  const credentials = dustManagedCredentials();
  // This example requires environment variables named "SPEECH_KEY" and "SPEECH_REGION"
  const speechConfig = SpeechConfig.fromSubscription(
    credentials.AZURE_SPEECH_API_KEY!,
    credentials.AZURE_SPEECH_REGION!
  );
  const autoDetectSourceLanguageConfig =
    AutoDetectSourceLanguageConfig.fromLanguages(["en-US", "fr-FR"]);

  const audioConfig = AudioConfig.fromWavFileInput(fs.readFileSync(filename));
  const speechRecognizer = SpeechRecognizer.FromConfig(
    speechConfig,
    autoDetectSourceLanguageConfig,
    audioConfig
  );

  const pushStream = AudioInputStream.createPushStream();

  return new Promise<void>((resolve) => {
    fs.createReadStream(filename)
      .on("data", function (arrayBuffer) {
        pushStream.write(arrayBuffer.slice());
      })
      .on("end", function () {
        pushStream.close();
      });

    logger.info("Transcribing from: " + filename);

    speechRecognizer.sessionStarted = function (s, e) {
      logger.info("Session started SessionId: " + e.sessionId);
    };
    speechRecognizer.sessionStopped = function (s, e) {
      logger.info("Session stopped SessionId: " + e.sessionId);
      speechRecognizer.stopContinuousRecognitionAsync();
      resolve();
    };
    speechRecognizer.canceled = function (s, e) {
      logger.info(e.errorDetails);
      speechRecognizer.stopContinuousRecognitionAsync();
      resolve();
    };
    speechRecognizer.recognizing = function (s, e) {
      logger.info(
        "TRANSCRIBED: Text=" +
          e.result.text +
          " Speaker ID=" +
          e.result.speakerId
      );
    };

    speechRecognizer.recognizeOnceAsync((result) => {
      console.log(`RECOGNIZED: Text=${result.text}`);
      speechRecognizer.close();
      resolve();
    });
  });
};

const gcloud = async (filename: string, logger: Logger) => {
  const serviceAccountPath = config.getServiceAccount();

  const client = new SpeechClient({ keyFilename: serviceAccountPath });

  logger.info("Transcribing from: " + filename);
  const stream = client.streamingRecognize({
    config: {
      encoding: "LINEAR16",
      languageCode: "fr-FR",
      sampleRateHertz: 44100,
    },
    interimResults: true,
  });

  let transcript = "";
  const promise = new Promise<void>((resolve) => {
    stream.on("data", (response: StreamingRecognizeResponse) => {
      logger.debug("Received response");
      const transcriptFromAPI =
        response.results[0].alternatives?.[0].transcript;
      if (!transcriptFromAPI) {
        return;
      }
      if (transcript === transcriptFromAPI) {
        return;
      }
      transcript = transcriptFromAPI;
      logger.info(transcript);
      logger.info(response.results[0].resultEndTime);
      if (response.results[0].isFinal) {
        logger.info("Finished transcribing");
        resolve();
      }
    });
    stream.on("error", (err) => {
      logger.error("Error " + err);
      throw err;
    });
    stream.on("end", () => {
      logger.info("Finished transcribing");
      resolve();
    });
  });
  logger.info("Starting transcribing");
  fs.createReadStream(filename).pipe(stream);
  return promise;
};
