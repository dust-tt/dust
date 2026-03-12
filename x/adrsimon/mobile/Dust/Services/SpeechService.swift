import Foundation
import os
import Speech

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Speech")

@MainActor
final class SpeechService: ObservableObject {
    @Published var transcribedText: String = ""
    @Published var isRecording = false
    @Published var error: String?
    @Published var audioLevel: Float = 0

    private let audioEngine = AVAudioEngine()
    private var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
    private var recognitionTask: SFSpeechRecognitionTask?
    private let speechRecognizer = SFSpeechRecognizer()
    private var lastReportedLevel: Float = 0

    func requestPermissions() async -> Bool {
        let speechStatus = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }

        guard speechStatus == .authorized else {
            logger.warning("Speech recognition authorization denied: \(String(describing: speechStatus))")
            error = "Speech recognition permission denied"
            return false
        }

        let micGranted = await AVAudioApplication.requestRecordPermission()

        guard micGranted else {
            logger.warning("Microphone permission denied")
            error = "Microphone permission denied"
            return false
        }

        return true
    }

    func startRecording() {
        guard let speechRecognizer, speechRecognizer.isAvailable else {
            logger.error("Speech recognizer not available")
            error = "Speech recognition not available"
            return
        }

        transcribedText = ""
        error = nil

        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        recognitionRequest = request

        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.record, mode: .measurement)
            try audioSession.setActive(true, options: .notifyOthersOnDeactivation)
        } catch {
            logger.error("Failed to configure audio session: \(error)")
            self.error = "Failed to start recording"
            return
        }

        let inputNode = audioEngine.inputNode
        let recordingFormat = inputNode.outputFormat(forBus: 0)
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: recordingFormat) { [weak self] buffer, _ in
            request.append(buffer)
            Task { @MainActor in
                self?.updateAudioLevel(from: buffer)
            }
        }

        do {
            try audioEngine.start()
        } catch {
            logger.error("Audio engine failed to start: \(error)")
            self.error = "Failed to start recording"
            inputNode.removeTap(onBus: 0)
            return
        }

        recognitionTask = speechRecognizer.recognitionTask(with: request) { [weak self] result, error in
            Task { @MainActor in
                guard let self else { return }
                if let result {
                    self.transcribedText = result.bestTranscription.formattedString
                }
                if let error {
                    logger.error("Recognition error: \(error)")
                    self.error = error.localizedDescription
                    self.stopRecording()
                }
            }
        }

        isRecording = true
        logger.info("Recording started")
    }

    private func updateAudioLevel(from buffer: AVAudioPCMBuffer) {
        guard let channelData = buffer.floatChannelData?[0] else { return }
        let frames = Int(buffer.frameLength)
        var sum: Float = 0
        for idx in 0 ..< frames {
            sum += channelData[idx] * channelData[idx]
        }
        let rms = sqrtf(sum / Float(max(frames, 1)))
        let level = min(max(rms * 8, 0), 1)
        guard abs(level - lastReportedLevel) > 0.05 else { return }
        lastReportedLevel = level
        audioLevel = level
    }

    func stopRecording() {
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        recognitionRequest?.endAudio()
        recognitionRequest = nil
        recognitionTask?.finish()
        recognitionTask = nil
        isRecording = false
        audioLevel = 0
        lastReportedLevel = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        logger.info("Recording stopped")
    }
}
