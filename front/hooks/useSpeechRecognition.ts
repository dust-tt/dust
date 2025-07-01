import { useCallback, useEffect, useRef, useState } from "react";

interface SpeechRecognitionHook {
  isRecording: boolean;
  transcript: string;
  isSupported: boolean;
  startRecording: () => void;
  stopRecording: () => void;
  resetTranscript: () => void;
  error: string | null;
}

export const useSpeechRecognition = (): SpeechRecognitionHook => {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Check if SpeechRecognition is supported
  const isSupported = Boolean(
    typeof window !== "undefined" &&
      (window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const startRecording = useCallback(() => {
    if (!isSupported) {
      setError("Speech recognition is not supported in this browser");
      return;
    }

    if (isRecording) {
      return;
    }

    // Check for microphone permission first
    if (navigator.permissions) {
      navigator.permissions
        .query({ name: "microphone" as PermissionName })
        .then((result) => {
          if (result.state === "denied") {
            setError(
              "Microphone access denied. Please allow microphone access in your browser settings"
            );
            return;
          }
        })
        .catch(() => {
          // Permission API not supported, continue with speech recognition
        });
    }

    setError(null);
    setTranscript("");

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      setIsRecording(true);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interimTranscript = "";
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + " ";
        } else {
          interimTranscript += transcript;
        }
      }

      setTranscript((prev) => {
        // Only update with final results to avoid flickering
        if (finalTranscript) {
          return prev + finalTranscript;
        }
        return prev;
      });
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      setError(
        `Speech Recognition may not be supported in this browser or the microphone may not be accessible. ${event.error}`
      );
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [isSupported, isRecording]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  }, [isRecording]);

  const resetTranscript = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  return {
    isRecording,
    transcript,
    isSupported,
    startRecording,
    stopRecording,
    resetTranscript,
    error,
  };
};
