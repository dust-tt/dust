import AVFoundation
import Foundation
import ScreenCaptureKit

@available(macOS 12.3, *)
class SystemAudioRecorder: NSObject, ObservableObject {
    private var streamConfiguration: SCStreamConfiguration?
    private var stream: SCStream?
    private var audioFile: AVAudioFile?
    private var tempURL: URL?
    
    // Permission caching
    private var cachedScreenPermission: Bool?
    
    @Published var isRecording = false
    @Published var recordingData: Data?
    @Published var recordingId: String?
    
    func resetPermissionCache() {
        cachedScreenPermission = nil
        print("[SystemAudioRecorder] Permission cache reset")
    }
    
    func requestPermission() async -> Bool {
        // Check if we already have cached permission result
        if let cached = cachedScreenPermission {
            print("[SystemAudioRecorder] Using cached screen recording permission: \(cached)")
            return cached
        }
        
        // Use CGPreflightScreenCaptureAccess to check without triggering permission dialog
        let hasAccess = CGPreflightScreenCaptureAccess()
        
        if hasAccess {
            print("[SystemAudioRecorder] Screen recording permission already granted")
            cachedScreenPermission = true
            return true
        }
        
        print("[SystemAudioRecorder] Screen recording permission not granted, requesting...")
        
        // Request permission using CGRequestScreenCaptureAccess
        let granted = CGRequestScreenCaptureAccess()
        
        if granted {
            print("[SystemAudioRecorder] Screen recording permission granted by user")
            cachedScreenPermission = true
            return true
        } else {
            print("[SystemAudioRecorder] Screen recording permission denied by user")
            cachedScreenPermission = false
            return false
        }
    }
    
    func startRecording() async {
        guard !isRecording else { return }
        
        // Double-check permissions before starting
        let hasPermission = await requestPermission()
        if !hasPermission {
            print("[SystemAudioRecorder] Cannot start recording: no screen capture permission")
            await MainActor.run {
                isRecording = false
                recordingData = nil
            }
            return
        }
        
        let recordingTimestamp = Int(Date().timeIntervalSince1970)
        recordingId = "\(AudioSettings.recordingPrefix)system_\(recordingTimestamp)"
        
        // Create temporary file URL
        let tempDir = FileManager.default.temporaryDirectory
        tempURL = tempDir.appendingPathComponent(
            "\(recordingId!)\(AudioSettings.audioFileExtension)"
        )
        
        do {
            try await setupSystemAudioCapture()
            
            await MainActor.run {
                isRecording = true
                recordingData = nil
            }
            print("[SystemAudioRecorder] System audio recording started successfully")
        } catch {
            print("[SystemAudioRecorder] Failed to start system audio recording: \(error)")
            
            // If we get a permission error, reset the cache so user can retry
            if error.localizedDescription.contains("permission") || error.localizedDescription.contains("denied") {
                resetPermissionCache()
            }
            
            cleanup()
            await MainActor.run {
                isRecording = false
                recordingData = nil
            }
        }
    }
    
    func stopRecording() {
        guard isRecording else { return }
        
        cleanup()
        
        Task { @MainActor in
            isRecording = false
            
            if let tempURL = tempURL {
                do {
                    recordingData = try Data(contentsOf: tempURL)
                    
                    // In development mode, save a copy to disk for debugging
                    if AppConfig.isDevelopment {
                        saveRecordingToDisk(from: tempURL)
                    }
                    
                    try FileManager.default.removeItem(at: tempURL)
                    print("[SystemAudioRecorder] System audio recording loaded into memory (\(recordingData?.count ?? 0) bytes)")
                } catch {
                    print("[SystemAudioRecorder] Failed to load system audio recording data: \(error)")
                    recordingData = nil
                    recordingId = nil
                }
            }
            
            tempURL = nil
        }
    }
    
    private func setupSystemAudioCapture() async throws {
        let content = try await SCShareableContent.excludingDesktopWindows(false, onScreenWindowsOnly: true)
        
        guard let display = content.displays.first else {
            throw NSError(domain: "SystemAudioRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No displays available"])
        }
        
        // Configure stream for audio-only capture
        let config = SCStreamConfiguration()
        config.capturesAudio = true
        config.sampleRate = 48000
        config.channelCount = 2
        config.excludesCurrentProcessAudio = true
        config.width = 1  // Minimal video capture
        config.height = 1
        config.minimumFrameInterval = CMTime(value: 1, timescale: 1) // 1 FPS minimal
        
        // Create filter to capture system audio (we need at least one display)
        let filter = SCContentFilter(display: display, excludingWindows: [])
        
        // Create the stream
        stream = SCStream(filter: filter, configuration: config, delegate: self)
        
        // Setup audio file for writing
        try setupAudioFile()
        
        // Start the stream
        try await stream?.startCapture()
        
        streamConfiguration = config
        print("[SystemAudioRecorder] System audio capture configured and started")
    }
    
    private func setupAudioFile() throws {
        guard let tempURL = tempURL else {
            throw NSError(domain: "SystemAudioRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "No temp URL available"])
        }
        
        audioFile = try AVAudioFile(
            forWriting: tempURL,
            settings: [
                AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
                AVSampleRateKey: 48000,
                AVNumberOfChannelsKey: 2,
                AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
            ] as [String: Any]
        )
        
        print("[SystemAudioRecorder] Audio file configured for system audio recording")
    }
    
    private func cleanup() {
        Task {
            do {
                try await stream?.stopCapture()
            } catch {
                print("[SystemAudioRecorder] Error stopping stream: \(error)")
            }
        }
        
        stream = nil
        streamConfiguration = nil
        audioFile = nil
        print("[SystemAudioRecorder] Cleanup completed")
    }
    
    private func saveRecordingToDisk(from tempURL: URL) {
        guard let recordingId = recordingId else {
            print("[SystemAudioRecorder] No recording ID available for disk save")
            return
        }
        
        do {
            // Create a recordings directory on the desktop
            let desktopURL = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first!
            let recordingsDir = desktopURL.appendingPathComponent("recordings")
            
            try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true, attributes: nil)
            
            let destinationURL = recordingsDir.appendingPathComponent("\(recordingId).m4a")
            
            try FileManager.default.copyItem(at: tempURL, to: destinationURL)
            
            print("[SystemAudioRecorder] Dev mode: Saved system audio recording to \(destinationURL.path)")
        } catch {
            print("[SystemAudioRecorder] Failed to save system audio recording to disk: \(error)")
        }
    }
}

// MARK: - SCStreamDelegate
@available(macOS 12.3, *)
extension SystemAudioRecorder: SCStreamDelegate {
    func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .audio else { return }
        
        // Convert CMSampleBuffer to AVAudioPCMBuffer
        guard let audioBuffer = convertToAudioBuffer(sampleBuffer: sampleBuffer) else {
            print("[SystemAudioRecorder] Failed to convert sample buffer to audio buffer")
            return
        }
        
        // Write to file
        do {
            try audioFile?.write(from: audioBuffer)
        } catch {
            print("[SystemAudioRecorder] Failed to write system audio: \(error)")
        }
    }
    
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        print("[SystemAudioRecorder] Stream stopped with error: \(error)")
        Task { @MainActor in
            isRecording = false
        }
    }
    
    private func convertToAudioBuffer(sampleBuffer: CMSampleBuffer) -> AVAudioPCMBuffer? {
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            return nil
        }
        
        let audioStreamBasicDescription = CMAudioFormatDescriptionGetStreamBasicDescription(formatDescription)
        
        guard let description = audioStreamBasicDescription?.pointee else {
            return nil
        }
        
        var mutableDescription = description
        let format = AVAudioFormat(streamDescription: &mutableDescription)
        
        guard let format = format,
              let audioBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AVAudioFrameCount(CMSampleBufferGetNumSamples(sampleBuffer))) else {
            return nil
        }
        
        // Copy audio data from CMSampleBuffer to AVAudioPCMBuffer
        guard let blockBuffer = CMSampleBufferGetDataBuffer(sampleBuffer) else {
            return nil
        }
        
        var lengthAtOffset = 0
        var totalLength = 0
        var dataPointer: UnsafeMutablePointer<Int8>?
        
        let status = CMBlockBufferGetDataPointer(blockBuffer, atOffset: 0, lengthAtOffsetOut: &lengthAtOffset, totalLengthOut: &totalLength, dataPointerOut: &dataPointer)
        
        guard status == kCMBlockBufferNoErr,
              let dataPointer = dataPointer,
              let audioBufferData = audioBuffer.floatChannelData else {
            return nil
        }
        
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        audioBuffer.frameLength = AVAudioFrameCount(frameCount)
        
        // Copy the data (assuming float32 stereo)
        let bytesPerFrame = Int(description.mBytesPerFrame)
        let channelCount = Int(description.mChannelsPerFrame)
        
        dataPointer.withMemoryRebound(to: Float.self, capacity: totalLength / MemoryLayout<Float>.size) { floatPointer in
            for channel in 0..<channelCount {
                for frame in 0..<Int(frameCount) {
                    audioBufferData[channel][frame] = floatPointer[frame * channelCount + channel]
                }
            }
        }
        
        return audioBuffer
    }
}