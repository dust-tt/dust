import AVFoundation
import Foundation
import ScreenCaptureKit

class CombinedAudioRecorder: NSObject, ObservableObject {
    private let microphoneRecorder = AudioRecorder()
    private var systemAudioRecorder: SystemAudioRecorder?
    
    @Published var isRecording = false
    @Published var combinedRecordingData: Data?
    @Published var recordingId: String?
    
    enum RecordingMode {
        case microphoneOnly
        case systemAudioOnly
        case combined // Both microphone and system audio
    }
    
    private var currentMode: RecordingMode = .microphoneOnly
    
    override init() {
        super.init()
        
        // Initialize SystemAudioRecorder only if available
        if #available(macOS 12.3, *) {
            systemAudioRecorder = SystemAudioRecorder()
        }
    }
    
    func requestPermissions(for mode: RecordingMode) async -> Bool {
        switch mode {
        case .microphoneOnly:
            return await microphoneRecorder.requestPermission()
            
        case .systemAudioOnly:
            guard #available(macOS 12.3, *),
                  let systemRecorder = systemAudioRecorder else {
                print("[CombinedAudioRecorder] System audio recording not available on this macOS version")
                return false
            }
            return await systemRecorder.requestPermission()
            
        case .combined:
            let micPermission = await microphoneRecorder.requestPermission()
            
            guard #available(macOS 12.3, *),
                  let systemRecorder = systemAudioRecorder else {
                print("[CombinedAudioRecorder] System audio recording not available, falling back to microphone only")
                return micPermission
            }
            
            let systemPermission = await systemRecorder.requestPermission()
            return micPermission && systemPermission
        }
    }
    
    func startRecording(mode: RecordingMode) async {
        guard !isRecording else { return }
        
        currentMode = mode
        let recordingTimestamp = Int(Date().timeIntervalSince1970)
        recordingId = "\(AudioSettings.recordingPrefix)combined_\(recordingTimestamp)"
        
        await MainActor.run {
            isRecording = true
            combinedRecordingData = nil
        }
        
        switch mode {
        case .microphoneOnly:
            await microphoneRecorder.startRecording()
            
        case .systemAudioOnly:
            if #available(macOS 12.3, *),
               let systemRecorder = systemAudioRecorder {
                await systemRecorder.startRecording()
            }
            
        case .combined:
            // Start both recordings simultaneously
            async let micTask = microphoneRecorder.startRecording()
            
            if #available(macOS 12.3, *),
               let systemRecorder = systemAudioRecorder {
                async let systemTask = systemRecorder.startRecording()
                await micTask
                await systemTask
            } else {
                await micTask
            }
        }
        
        print("[CombinedAudioRecorder] Started recording in mode: \(mode)")
    }
    
    func stopRecording() async {
        guard isRecording else { return }
        
        switch currentMode {
        case .microphoneOnly:
            microphoneRecorder.stopRecording()
            
            // Wait for microphone data to be ready
            await waitForMicrophoneData()
            
            await MainActor.run {
                combinedRecordingData = microphoneRecorder.recordingData
                isRecording = false
            }
            
        case .systemAudioOnly:
            if #available(macOS 12.3, *),
               let systemRecorder = systemAudioRecorder {
                systemRecorder.stopRecording()
                
                // Wait for system audio data to be ready
                await waitForSystemAudioData()
                
                await MainActor.run {
                    combinedRecordingData = systemRecorder.recordingData
                    isRecording = false
                }
            }
            
        case .combined:
            // Stop both recordings
            microphoneRecorder.stopRecording()
            
            if #available(macOS 12.3, *),
               let systemRecorder = systemAudioRecorder {
                systemRecorder.stopRecording()
                
                // Wait for both data sources
                await waitForMicrophoneData()
                await waitForSystemAudioData()
                
                // Combine the audio files
                await combineAudioFiles()
            } else {
                await waitForMicrophoneData()
                await MainActor.run {
                    combinedRecordingData = microphoneRecorder.recordingData
                }
            }
            
            await MainActor.run {
                isRecording = false
            }
        }
        
        print("[CombinedAudioRecorder] Recording stopped")
    }
    
    private func waitForMicrophoneData() async {
        // Poll until microphone data is available
        while microphoneRecorder.recordingData == nil && microphoneRecorder.isRecording {
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
    }
    
    private func waitForSystemAudioData() async {
        guard #available(macOS 12.3, *),
              let systemRecorder = systemAudioRecorder else { return }
        
        // Poll until system audio data is available
        while systemRecorder.recordingData == nil && systemRecorder.isRecording {
            try? await Task.sleep(nanoseconds: 50_000_000) // 50ms
        }
    }
    
    private func combineAudioFiles() async {
        guard let micData = microphoneRecorder.recordingData,
              #available(macOS 12.3, *),
              let systemRecorder = systemAudioRecorder,
              let systemData = systemRecorder.recordingData else {
            print("[CombinedAudioRecorder] Missing audio data for combining")
            await MainActor.run {
                combinedRecordingData = microphoneRecorder.recordingData ?? systemAudioRecorder?.recordingData
            }
            return
        }
        
        do {
            let combinedData = try await mixAudioFiles(microphoneData: micData, systemAudioData: systemData)
            await MainActor.run {
                combinedRecordingData = combinedData
            }
            print("[CombinedAudioRecorder] Successfully combined audio files (\(combinedData.count) bytes)")
        } catch {
            print("[CombinedAudioRecorder] Failed to combine audio files: \(error)")
            // Fallback to microphone data
            await MainActor.run {
                combinedRecordingData = micData
            }
        }
    }
    
    private func mixAudioFiles(microphoneData: Data, systemAudioData: Data) async throws -> Data {
        // Create temporary files for both audio sources
        let tempDir = FileManager.default.temporaryDirectory
        let micTempURL = tempDir.appendingPathComponent("mic_temp.m4a")
        let systemTempURL = tempDir.appendingPathComponent("system_temp.m4a")
        let outputTempURL = tempDir.appendingPathComponent("combined_temp.m4a")
        
        defer {
            // Clean up temp files
            try? FileManager.default.removeItem(at: micTempURL)
            try? FileManager.default.removeItem(at: systemTempURL)
            try? FileManager.default.removeItem(at: outputTempURL)
        }
        
        // Write data to temp files
        try microphoneData.write(to: micTempURL)
        try systemAudioData.write(to: systemTempURL)
        
        // Create audio assets
        let micAsset = AVURLAsset(url: micTempURL)
        let systemAsset = AVURLAsset(url: systemTempURL)
        
        // Create composition
        let composition = AVMutableComposition()
        
        // Add microphone track
        guard let micTrack = micAsset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "CombinedAudioRecorder", code: 1, userInfo: [NSLocalizedDescriptionKey: "No microphone audio track found"])
        }
        
        let compositionMicTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        try compositionMicTrack?.insertTimeRange(CMTimeRange(start: .zero, duration: micAsset.duration), of: micTrack, at: .zero)
        
        // Add system audio track
        guard let systemTrack = systemAsset.tracks(withMediaType: .audio).first else {
            throw NSError(domain: "CombinedAudioRecorder", code: 2, userInfo: [NSLocalizedDescriptionKey: "No system audio track found"])
        }
        
        let compositionSystemTrack = composition.addMutableTrack(withMediaType: .audio, preferredTrackID: kCMPersistentTrackID_Invalid)
        try compositionSystemTrack?.insertTimeRange(CMTimeRange(start: .zero, duration: systemAsset.duration), of: systemTrack, at: .zero)
        
        // Create export session
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: AVAssetExportPresetAppleM4A) else {
            throw NSError(domain: "CombinedAudioRecorder", code: 3, userInfo: [NSLocalizedDescriptionKey: "Cannot create export session"])
        }
        
        exportSession.outputURL = outputTempURL
        exportSession.outputFileType = .m4a
        
        // Export
        await exportSession.export()
        
        guard exportSession.status == .completed else {
            throw NSError(domain: "CombinedAudioRecorder", code: 4, userInfo: [NSLocalizedDescriptionKey: "Export failed: \(exportSession.error?.localizedDescription ?? "Unknown error")"])
        }
        
        // Read combined data
        return try Data(contentsOf: outputTempURL)
    }
    
    // Computed properties for UI binding
    var micRecorder: AudioRecorder {
        return microphoneRecorder
    }
    
    @available(macOS 12.3, *)
    var systemRecorder: SystemAudioRecorder? {
        return systemAudioRecorder
    }
    
    var isSystemAudioAvailable: Bool {
        if #available(macOS 12.3, *) {
            return systemAudioRecorder != nil
        }
        return false
    }
    
    func resetSystemAudioPermissionCache() {
        if #available(macOS 12.3, *) {
            systemAudioRecorder?.resetPermissionCache()
        }
    }
}