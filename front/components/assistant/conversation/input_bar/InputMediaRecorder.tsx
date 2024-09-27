import { useState } from "react";

import { classNames } from "@app/lib/utils";

const InputMediaRecorder = ({
  onFinished,
}: {
  onFinished: (text: string) => void;
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [closing, setClosing] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | undefined>(
    undefined
  );
  const [ttsSocket, setTtsSocket] = useState<WebSocket | undefined>(undefined);
  const [audioStream, setAudioStream] = useState<MediaStream | undefined>(
    undefined
  );

  const [currentSpeech, setCurrentSpeech] = useState("");

  const createSpeechToTextSocket = async (): Promise<WebSocket> => {
    const socket = new WebSocket("wss://api.deepgram.com/v1/listen", [
      "token",
      "",
    ]);

    socket.onmessage = (message) => {
      const received = JSON.parse(message.data);
      const transcript = received.channel?.alternatives[0].transcript;
      if (transcript && received.is_final) {
        setCurrentSpeech((v) => {
          return `${v} ${transcript}`;
        });
      }
    };
    return new Promise((resolve) => {
      socket.onopen = () => {
        resolve(socket);
      };
    });
  };

  const initializeRecorder = async () => {
    setCurrentSpeech("");
    const constraints: { audio: boolean } = { audio: true };
    const stream = await navigator.mediaDevices.getUserMedia(constraints);

    const socket = await createSpeechToTextSocket();
    const recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        socket.send(event.data);
      }
    };
    recorder.onstop = () => {};
    recorder.start(1000);

    setTtsSocket(socket);
    setIsRecording(true);
    setMediaRecorder(recorder);
    setAudioStream(stream);
  };

  const stopRecorder = async () => {
    setClosing(true);
    if (mediaRecorder) {
      mediaRecorder.stop();
    }
    if (audioStream) {
      audioStream.getTracks().forEach((track) => track.stop());
    }
    if (
      ttsSocket &&
      (ttsSocket.readyState === WebSocket.OPEN ||
        ttsSocket.readyState === WebSocket.CONNECTING)
    ) {
      ttsSocket.close();
    }
    await new Promise((r) => setTimeout(r, 2000));
    setIsRecording(false);
    setClosing(false);
    onFinished(currentSpeech);
  };

  return (
    <div
      className={classNames(
        "flex h-4 w-4 flex-wrap items-center justify-center rounded-full",
        isRecording && !closing ? "animate-indicator-blink" : ""
      )}
      onClick={async () => {
        if (!isRecording) {
          await initializeRecorder();
        } else {
          await stopRecorder();
        }
      }}
    >
      {closing && (
        <svg
          aria-hidden="true"
          className="h-4 w-4 animate-spin fill-blue-600 text-gray-200 dark:text-gray-600"
          viewBox="0 0 100 100"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
            fill="currentColor"
          />
          <path
            d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
            fill="currentFill"
          />
        </svg>
      )}
      {!closing && !isRecording && (
        <div
          className={`h-3 w-3 cursor-pointer rounded-full bg-red-500 hover:relative ${!isRecording ? "hover:bottom-0.5" : ""}`}
        ></div>
      )}
      {!closing && isRecording && (
        <div
          className={`indicator-blink h-3 w-3 cursor-pointer rounded-full bg-red-500 hover:relative ${!isRecording ? "hover:bottom-0.5" : ""}`}
        ></div>
      )}
    </div>
  );
};

export default InputMediaRecorder;
