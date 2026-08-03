import AVFoundation
import Foundation
import Observation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Speech")

/// Captures microphone audio and streams it to ElevenLabs Scribe for real-time
/// transcription. Transcript text arrives live while the user speaks (via `onTranscript`)
/// rather than after a post-recording upload.
@MainActor
@Observable
final class SpeechService {
    var isRecording = false
    /// True briefly after stop while we wait for the server's final committed segment.
    var isFinalizing = false
    var error: String?
    var audioLevel: Float = 0

    /// Called on every transcript change with the full text so far (committed + in-progress).
    var onTranscript: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let sampleRateHz: Double = 16000

    private var audioEngine: AVAudioEngine?
    private var converter: AVAudioConverter?
    private var targetFormat: AVAudioFormat?
    private var client: ScribeRealtimeClient?
    private var lastReportedLevel: Float = 0

    private var committedText = ""
    private var partialText = ""
    private var finalizeTask: Task<Void, Never>?

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

    func startRecording() async {
        committedText = ""
        partialText = ""
        error = nil

        do {
            let credentials = try await TranscribeTokenService.fetch(
                workspaceId: workspaceId,
                tokenProvider: tokenProvider
            )

            let client = ScribeRealtimeClient(token: credentials.token, baseUri: credentials.baseUri)
            client.onPartial = { [weak self] text in
                Task { @MainActor in self?.handlePartial(text) }
            }
            client.onCommitted = { [weak self] text in
                Task { @MainActor in self?.handleCommitted(text) }
            }
            client.onError = { [weak self] message in
                Task { @MainActor in self?.fail(message) }
            }
            try client.connect()
            self.client = client

            guard configureAudioSession(), startEngine() else {
                client.close()
                self.client = nil
                return
            }

            isRecording = true
            logger.info("Live transcription started")
        } catch {
            logger.error("Failed to start live transcription: \(error)")
            fail("Could not start recording: \(error.localizedDescription)")
        }
    }

    /// Stops capturing and asks the server to flush the final segment. The combined
    /// transcript is already in the input bar; we just await the trailing commit.
    func stopRecording() {
        guard isRecording else { return }
        teardownAudio()
        isRecording = false
        audioLevel = 0

        guard let client else {
            finish()
            return
        }
        isFinalizing = true
        client.commit()
        // Safety net: stop waiting if the server never delivers the final commit.
        finalizeTask = Task { [weak self] in
            try? await Task.sleep(for: .seconds(2))
            self?.finish()
        }
    }

    func cancel() {
        teardownAudio()
        finalizeTask?.cancel()
        finalizeTask = nil
        client?.close()
        client = nil
        isRecording = false
        isFinalizing = false
        committedText = ""
        partialText = ""
        audioLevel = 0
    }

    private func handlePartial(_ text: String) {
        partialText = text
        onTranscript?(combinedTranscript())
    }

    private func handleCommitted(_ text: String) {
        committedText = appending(text, to: committedText)
        partialText = ""
        onTranscript?(combinedTranscript())
        // The final commit after a user stop arrives here — we can close now.
        if isFinalizing {
            finish()
        }
    }

    private func finish() {
        finalizeTask?.cancel()
        finalizeTask = nil
        isFinalizing = false
        client?.close()
        client = nil
    }

    private func fail(_ message: String) {
        error = message
        onError?(message)
        cancel()
    }

    private func combinedTranscript() -> String {
        appending(partialText, to: committedText)
    }

    private func appending(_ segment: String, to base: String) -> String {
        guard !segment.isEmpty else { return base }
        return base.isEmpty ? segment : base + " " + segment
    }

    // MARK: - Audio capture

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

    private func startEngine() -> Bool {
        let engine = AVAudioEngine()
        let hwFormat = engine.inputNode.outputFormat(forBus: 0)
        guard hwFormat.sampleRate > 0, hwFormat.channelCount > 0 else {
            logger.error("Invalid input format: \(hwFormat)")
            error = "Microphone not available"
            return false
        }

        // ElevenLabs pcm_16000: 16 kHz, mono, signed 16-bit little-endian.
        guard let target = AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: sampleRateHz,
            channels: 1,
            interleaved: true
        ), let converter = AVAudioConverter(from: hwFormat, to: target) else {
            error = "Failed to start recording"
            return false
        }
        targetFormat = target
        self.converter = converter

        installTap(on: engine.inputNode, format: hwFormat)

        do {
            try engine.start()
        } catch {
            logger.error("Audio engine failed to start: \(error)")
            self.error = "Failed to start recording"
            engine.inputNode.removeTap(onBus: 0)
            return false
        }
        audioEngine = engine
        return true
    }

    private func installTap(on inputNode: AVAudioInputNode, format: AVAudioFormat) {
        // Captured locally so the audio-thread closure never touches main-actor state.
        let converter = converter
        let target = targetFormat
        let client = client
        let sampleRateHz = sampleRateHz

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            if let converter, let target, let client,
               let base64 = Self.encodeChunk(buffer, converter: converter, target: target, sampleRateHz: sampleRateHz)
            {
                client.sendAudio(base64: base64)
            }
            let level = Self.computeLevel(from: buffer)
            Task { @MainActor in
                guard let self, abs(level - self.lastReportedLevel) > 0.05 else { return }
                self.lastReportedLevel = level
                self.audioLevel = level
            }
        }
    }

    private func teardownAudio() {
        if let engine = audioEngine {
            engine.stop()
            engine.inputNode.removeTap(onBus: 0)
        }
        audioEngine = nil
        converter = nil
        targetFormat = nil
        lastReportedLevel = 0
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Resamples a hardware buffer to 16 kHz mono Int16 and returns base64 PCM, or nil
    /// if the chunk produced no frames.
    nonisolated private static func encodeChunk(
        _ buffer: AVAudioPCMBuffer,
        converter: AVAudioConverter,
        target: AVAudioFormat,
        sampleRateHz: Double
    ) -> String? {
        let ratio = sampleRateHz / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 16
        guard let outBuffer = AVAudioPCMBuffer(pcmFormat: target, frameCapacity: capacity) else { return nil }

        var consumed = false
        var conversionError: NSError?
        converter.convert(to: outBuffer, error: &conversionError) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }

        guard conversionError == nil,
              outBuffer.frameLength > 0,
              let channel = outBuffer.int16ChannelData
        else { return nil }

        let data = Data(bytes: channel[0], count: Int(outBuffer.frameLength) * MemoryLayout<Int16>.size)
        return data.base64EncodedString()
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
