import AVFoundation
import Foundation
import Observation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Speech")

@MainActor
@Observable
final class SpeechService {
    var transcribedText: String = ""
    var isRecording = false
    var isTranscribing = false
    var error: String?
    var audioLevel: Float = 0

    private var audioEngine: AVAudioEngine?
    private var audioFile: AVAudioFile?
    private var recordingURL: URL?
    private var lastReportedLevel: Float = 0
    private let writeQueue = DispatchQueue(label: "com.dust.audioFileWriter")

    private let workspaceId: String
    private let tokenProvider: TokenProvider

    init(workspaceId: String, tokenProvider: TokenProvider) {
        self.workspaceId = workspaceId
        self.tokenProvider = tokenProvider
    }

    func ensureMicPermission() async -> Bool {
        switch AVAudioApplication.shared.recordPermission {
        case .granted:
            return true
        case .denied:
            error = "Microphone permission denied"
            return false
        case .undetermined:
            let granted = await AVAudioApplication.requestRecordPermission()
            if !granted { error = "Microphone permission denied" }
            return granted
        @unknown default:
            return false
        }
    }

    func startRecording() {
        transcribedText = ""
        error = nil

        let engine = AVAudioEngine()
        audioEngine = engine

        guard configureAudioSession() else { return }
        guard let hwFormat = validInputFormat(for: engine) else { return }
        guard prepareAudioFile(format: hwFormat) else { return }

        installAudioTap(on: engine.inputNode, format: hwFormat)

        do {
            try engine.start()
        } catch {
            logger.error("Audio engine failed to start: \(error)")
            self.error = "Failed to start recording"
            engine.inputNode.removeTap(onBus: 0)
            return
        }

        isRecording = true
        logger.info("Recording started")
    }

    func stopRecording() {
        guard let engine = audioEngine else { return }
        engine.stop()
        engine.inputNode.removeTap(onBus: 0)
        audioEngine = nil
        audioFile = nil
        isRecording = false
        audioLevel = 0
        lastReportedLevel = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        logger.info("Recording stopped")
    }

    func transcribe() async {
        guard let recordingURL else {
            error = "No recording available"
            return
        }

        isTranscribing = true
        defer {
            isTranscribing = false
            cleanupRecording()
        }

        do {
            transcribedText = try await TranscriptionService.transcribe(
                fileURL: recordingURL,
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )
        } catch {
            logger.error("Transcription failed: \(error)")
            self.error = "Transcription failed: \(error.localizedDescription)"
        }
    }

    func cleanupRecording() {
        if let url = recordingURL {
            try? FileManager.default.removeItem(at: url)
            recordingURL = nil
        }
    }

    private func configureAudioSession() -> Bool {
        do {
            let session = AVAudioSession.sharedInstance()
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker])
            try session.setActive(true, options: .notifyOthersOnDeactivation)
            return true
        } catch {
            logger.error("Audio session failed: \(error)")
            self.error = "Failed to start recording"
            return false
        }
    }

    private func validInputFormat(for engine: AVAudioEngine) -> AVAudioFormat? {
        let hwFormat = engine.inputNode.outputFormat(forBus: 0)
        guard hwFormat.sampleRate > 0, hwFormat.channelCount > 0 else {
            logger.error("Invalid input format: \(hwFormat)")
            error = "Microphone not available"
            return nil
        }
        return hwFormat
    }

    private func prepareAudioFile(format: AVAudioFormat) -> Bool {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("recording-\(UUID().uuidString).wav")
        do {
            audioFile = try AVAudioFile(forWriting: url, settings: format.settings)
            recordingURL = url
            return true
        } catch {
            logger.error("Failed to create audio file: \(error)")
            self.error = "Failed to start recording"
            return false
        }
    }

    private func installAudioTap(on inputNode: AVAudioInputNode, format: AVAudioFormat) {
        inputNode.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            guard let self else { return }
            let file = audioFile
            writeQueue.async {
                try? file?.write(from: buffer)
            }
            let level = Self.computeLevel(from: buffer)
            Task { @MainActor in
                guard abs(level - self.lastReportedLevel) > 0.05 else { return }
                self.lastReportedLevel = level
                self.audioLevel = level
            }
        }
    }

    nonisolated private static func computeLevel(from buffer: AVAudioPCMBuffer) -> Float {
        guard let channelData = buffer.floatChannelData?[0] else { return 0 }
        let frames = Int(buffer.frameLength)
        var sum: Float = 0
        for idx in 0 ..< frames {
            sum += channelData[idx] * channelData[idx]
        }
        let rms = sqrtf(sum / Float(max(frames, 1)))
        return min(max(rms * 8, 0), 1)
    }
}
