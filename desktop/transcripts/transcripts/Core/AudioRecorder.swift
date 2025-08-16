import AVFoundation
import Foundation

class AudioRecorder: NSObject, ObservableObject {
  private var audioEngine = AVAudioEngine()
  private var audioFile: AVAudioFile?
  private var tempURL: URL?
  // Simple audio capture - microphone only

  // Permission caching
  private var cachedMicPermission: Bool?

  @Published var isRecording = false
  @Published var recordingData: Data?
  @Published var recordingId: String?

  func requestPermission() async -> Bool {
    // Check if we already have cached permission result
    if let cached = cachedMicPermission {
      print("[AudioRecorder] Using cached microphone permission: \(cached)")
      return cached
    }

    // Check current authorization status first
    let currentStatus = AVCaptureDevice.authorizationStatus(for: .audio)

    switch currentStatus {
    case .authorized:
      print("[AudioRecorder] Microphone already authorized")
      cachedMicPermission = true
      return true
    case .denied, .restricted:
      print("[AudioRecorder] Microphone access denied or restricted")
      cachedMicPermission = false
      return false
    case .notDetermined:
      print("[AudioRecorder] Requesting microphone permission...")
      // Only request permission if not yet determined
      let micPermission = await withCheckedContinuation { continuation in
        AVCaptureDevice.requestAccess(for: .audio) { granted in
          continuation.resume(returning: granted)
        }
      }

      print("[AudioRecorder] Microphone permission result: \(micPermission)")
      cachedMicPermission = micPermission
      return micPermission
    @unknown default:
      print("[AudioRecorder] Unknown microphone permission status")
      cachedMicPermission = false
      return false
    }
  }

  func startRecording() async {
    guard !isRecording else { return }

    let recordingTimestamp = Int(Date().timeIntervalSince1970)
    recordingId = "\(AudioSettings.recordingPrefix)\(recordingTimestamp)"

    // Create temporary file URL
    let tempDir = FileManager.default.temporaryDirectory
    tempURL = tempDir.appendingPathComponent(
      "\(recordingId!)\(AudioSettings.audioFileExtension)"
    )

    do {
      try setupAudioEngine()
      try audioEngine.start()

      await MainActor.run {
        isRecording = true
        recordingData = nil
      }
      print("[AudioRecorder] Recording started successfully")
    } catch {
      print("[AudioRecorder] Failed to start recording: \(error)")
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
          
          // In development mode, save a copy to disk for debugging.
          if AppConfig.isDevelopment {
            saveRecordingToDisk(from: tempURL)
          }
          
          try FileManager.default.removeItem(at: tempURL)
          print(
            "[AudioRecorder] Recording loaded into memory (\(recordingData?.count ?? 0) bytes)"
          )
        } catch {
          print("[AudioRecorder] Failed to load recording data: \(error)")
          recordingData = nil
          recordingId = nil
        }
      }

      tempURL = nil
    }
  }

  private func setupAudioEngine() throws {
    audioEngine.stop()
    audioEngine.reset()

    let inputNode = audioEngine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)

    print("[AudioRecorder] Input format: \(inputFormat)")
    print(
      "[AudioRecorder] Input format details - Sample Rate: \(inputFormat.sampleRate), Channels: \(inputFormat.channelCount), Format: \(inputFormat.commonFormat.rawValue)"
    )

    // Create mono format for final output using the same sample rate as input.
    let monoFormat = AVAudioFormat(
      commonFormat: .pcmFormatFloat32,
      sampleRate: inputFormat.sampleRate,
      channels: 1,
      interleaved: false
    )!

    audioFile = try AVAudioFile(
      forWriting: tempURL!,
      settings: [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: Int(inputFormat.sampleRate),
        AVNumberOfChannelsKey: AudioSettings.audioChannels,
        AVEncoderAudioQualityKey: AudioSettings.audioQuality,
      ] as [String: Any]
    )

    // Install tap using the input node's exact output format (no format conversion in tap)
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) {
      [weak self] buffer, _ in
      guard let self = self, let audioFile = self.audioFile else { return }

      // Convert microphone input to mono using the actual buffer format
      let finalBuffer = self.convertToMono(
        buffer: buffer,
        outputFormat: monoFormat
      )

      do {
        try audioFile.write(from: finalBuffer)
      } catch {
        print("[AudioRecorder] Failed to write audio: \(error)")
      }
    }

    audioEngine.prepare()
    print("[AudioRecorder] Audio engine configured for microphone recording")
  }

  private func convertToMono(
    buffer: AVAudioPCMBuffer,
    outputFormat: AVAudioFormat
  ) -> AVAudioPCMBuffer {
    guard
      let outputBuffer = AVAudioPCMBuffer(
        pcmFormat: outputFormat,
        frameCapacity: buffer.frameCapacity
      )
    else {
      print("[AudioRecorder] Failed to create mono output buffer")
      return buffer  // Return original as fallback
    }

    guard let inputData = buffer.floatChannelData,
      let outputData = outputBuffer.floatChannelData
    else {
      print("[AudioRecorder] Failed to get channel data for mono conversion")
      return buffer
    }

    outputBuffer.frameLength = buffer.frameLength
    let channelCount = Int(buffer.format.channelCount)

    // Convert to mono by averaging all input channels
    for frame in 0..<Int(buffer.frameLength) {
      var sum: Float = 0
      for channel in 0..<channelCount {
        sum += inputData[channel][frame]
      }
      outputData[0][frame] = sum / Float(channelCount)
    }

    print("[AudioRecorder] Converted \(buffer.frameLength) frames to mono")
    return outputBuffer
  }

  private func cleanup() {
    // Remove tap from input node
    audioEngine.inputNode.removeTap(onBus: 0)

    audioEngine.stop()
    audioEngine.reset()
    audioFile = nil
    print("[AudioRecorder] Cleanup completed")
  }

  private func saveRecordingToDisk(from tempURL: URL) {
    guard let recordingId = recordingId else {
      print("[AudioRecorder] No recording ID available for disk save")
      return
    }
    
    do {
      // Create a recordings directory in the app's Documents folder.
      let documentsURL = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first!
      let recordingsDir = documentsURL.appendingPathComponent("recordings")

      try FileManager.default.createDirectory(at: recordingsDir, withIntermediateDirectories: true, attributes: nil)
      
      let destinationURL = recordingsDir.appendingPathComponent("\(recordingId).m4a")

      try FileManager.default.copyItem(at: tempURL, to: destinationURL)
      
      print("[AudioRecorder] Dev mode: Saved recording to \(destinationURL.path)")
    } catch {
      print("[AudioRecorder] Failed to save recording to disk: \(error)")
    }
  }

}
