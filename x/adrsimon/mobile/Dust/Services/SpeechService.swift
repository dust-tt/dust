import AVFoundation
import Foundation
import Observation
import os

private let logger = Logger(subsystem: AppConfig.bundleId, category: "Speech")

/// Captures microphone audio and streams it to ElevenLabs Scribe for real-time
/// transcription. Transcript text arrives live while the user speaks (via `onTranscript`)
/// rather than after a post-recording upload.
/**
 * @cc [owner:adrsimon,label:product] survive-network-drop
 * A disconnect while recording or finalizing MUST NOT end the session or drop captured audio:
 * capture continues, and audio not yet covered by a committed transcript is replayed on a new
 * connection once one is established. Only a server error, `cancel`, the final commit, or the
 * finalize timeout end it; audio sent between a server commit and its receipt may be lost.
 */
@MainActor
@Observable
final class SpeechService {
    var isRecording = false
    /// True after stop while we wait for the server's final committed segment.
    var isFinalizing = false
    var isReconnecting = false
    var error: String?
    var audioLevel: Float = 0

    /// Called on every transcript change with the full text so far (committed + in-progress).
    var onTranscript: ((String) -> Void)?
    var onError: ((String) -> Void)?

    private let sampleRateHz: Double = 16000
    private let finalizeTimeout: Duration = .seconds(2)
    private let replayFinalizeTimeout: Duration = .seconds(15)
    private let initialReconnectDelay: Duration = .seconds(1)
    private let maxReconnectDelay: Duration = .seconds(8)
    private let handshakeTimeout: Duration = .seconds(5)

    private var audioEngine: AVAudioEngine?
    private var converter: AVAudioConverter?
    private var targetFormat: AVAudioFormat?
    private var client: ScribeRealtimeClient?
    private let relay = ScribeAudioRelay()
    private var reconnectTask: Task<Void, Never>?
    private var reconnectDelay: Duration = .zero
    private var handshakeTask: Task<Void, Never>?
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
        relay.reset()
        reconnectDelay = initialReconnectDelay

        do {
            try await connect(commitStrategy: .vad)

            guard configureAudioSession(), startEngine() else {
                closeClient()
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

        isFinalizing = true
        // While reconnecting, the reconnect commits once the pending audio is replayed.
        guard let client else { return }
        client.commit()
        armFinalizeTimeout(finalizeTimeout)
    }

    /// Safety net: stop waiting if the server never delivers the final commit.
    private func armFinalizeTimeout(_ timeout: Duration) {
        finalizeTask?.cancel()
        finalizeTask = Task { [weak self] in
            do {
                try await Task.sleep(for: timeout)
            } catch {
                return
            }
            self?.finish()
        }
    }

    func cancel() {
        teardownAudio()
        finalizeTask?.cancel()
        finalizeTask = nil
        reconnectTask?.cancel()
        reconnectTask = nil
        closeClient()
        relay.reset()
        isRecording = false
        isFinalizing = false
        isReconnecting = false
        committedText = ""
        partialText = ""
        audioLevel = 0
    }

    private func connect(commitStrategy: ScribeRealtimeClient.CommitStrategy) async throws {
        let credentials = try await TranscribeTokenService.fetch(
            workspaceId: workspaceId,
            tokenProvider: tokenProvider
        )
        try Task.checkCancellation()

        let client = ScribeRealtimeClient(
            token: credentials.token,
            baseUri: credentials.baseUri,
            commitStrategy: commitStrategy
        )
        client.onEvent = { [weak self, weak client] event in
            Task { @MainActor in
                guard let self, let client, self.client === client else { return }
                self.handle(event)
            }
        }
        try client.connect()
        self.client = client
        relay.attach(client)

        handshakeTask = Task { [weak self, weak client, handshakeTimeout] in
            do {
                try await Task.sleep(for: handshakeTimeout)
            } catch {
                return
            }
            guard let self, let client, self.client === client else { return }
            logger.error("Transcription handshake timed out")
            handleDisconnect()
        }
    }

    private func handle(_ event: ScribeRealtimeClient.Event) {
        switch event {
        case .sessionStarted:
            handshakeTask?.cancel()
            handshakeTask = nil
            reconnectDelay = initialReconnectDelay
            if isReconnecting {
                logger.notice("Transcription reconnected")
                isReconnecting = false
                if isFinalizing { armFinalizeTimeout(replayFinalizeTimeout) }
            }
        case let .partial(text):
            handlePartial(text)
        case let .committed(text):
            relay.markCommitted()
            handleCommitted(text)
        case let .error(message):
            fail(message)
        case .disconnected:
            handleDisconnect()
        }
    }

    private func handleDisconnect() {
        logger.warning("Transcription connection lost, reconnecting")
        closeClient()
        finalizeTask?.cancel()
        finalizeTask = nil
        isReconnecting = true
        guard reconnectTask == nil else { return }
        reconnectTask = Task { [weak self, maxReconnectDelay] in
            while let delay = self?.reconnectDelay {
                do {
                    try await Task.sleep(for: delay)
                    guard let self else { return }
                    reconnectDelay = min(reconnectDelay * 2, maxReconnectDelay)
                    // After stop, a single manual commit covers the whole replay.
                    let strategy: ScribeRealtimeClient.CommitStrategy = isFinalizing ? .manual : .vad
                    try await connect(commitStrategy: strategy)
                    if isFinalizing { client?.commit() }
                    reconnectTask = nil
                    return
                } catch is CancellationError {
                    return
                } catch {
                    logger.error("Transcription reconnect failed: \(error)")
                }
            }
        }
    }

    private func closeClient() {
        handshakeTask?.cancel()
        handshakeTask = nil
        relay.detach()
        client?.close()
        client = nil
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
        closeClient()
        relay.reset()
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
        let relay = relay
        let sampleRateHz = sampleRateHz

        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { [weak self] buffer, _ in
            if let converter, let target,
               let base64 = Self.encodeChunk(buffer, converter: converter, target: target, sampleRateHz: sampleRateHz)
            {
                relay.send(base64)
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
