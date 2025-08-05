import AVFoundation
import Foundation

class AudioRecorder: ObservableObject {
  private var audioEngine = AVAudioEngine()
  private var audioFile: AVAudioFile?
  private var tempURL: URL?

  @Published var isRecording = false
  @Published var recordingData: Data?
  @Published var recordingId: String?

  func requestPermission() async -> Bool {
    await withCheckedContinuation { continuation in
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        continuation.resume(returning: granted)
      }
    }
  }

  func startRecording() {
    guard !isRecording else { return }

    let recordingTimestamp = Int(Date().timeIntervalSince1970)
    recordingId = "\(AudioSettings.recordingPrefix)\(recordingTimestamp)"

    // Create temporary file URL
    let tempDir = FileManager.default.temporaryDirectory
    tempURL = tempDir.appendingPathComponent(
      "\(recordingId!)\(AudioSettings.audioFileExtension)"
    )

    do {
      try setupAudioEngineForSystemCapture()
      try audioEngine.start()

      isRecording = true
      recordingData = nil
    } catch {
      print("Failed to start recording: \(error)")
      cleanup()
    }
  }

  func stopRecording() {
    guard isRecording else { return }

    cleanup()
    isRecording = false

    if let tempURL = tempURL {
      do {
        recordingData = try Data(contentsOf: tempURL)
        try FileManager.default.removeItem(at: tempURL)
        print(
          "Recording loaded into memory (\(recordingData?.count ?? 0) bytes)"
        )
      } catch {
        print("Failed to load recording data: \(error)")
        recordingData = nil
        recordingId = nil
      }
    }

    tempURL = nil
  }

  private func setupAudioEngineForSystemCapture() throws {
    audioEngine.stop()
    audioEngine.reset()

    let inputNode = audioEngine.inputNode
    let inputFormat = inputNode.outputFormat(forBus: 0)

    audioFile = try AVAudioFile(
      forWriting: tempURL!,
      settings: [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: Int(inputFormat.sampleRate),
        AVNumberOfChannelsKey: AudioSettings.audioChannels,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      ] as [String: Any]
    )

    // Check if the selected input device is an aggregate device
    let currentInputDevice = AudioDeviceManager.shared.getCurrentInputDevice()
    let isAggregateDevice = currentInputDevice?.name.contains("Aggregate") == true ||
                           currentInputDevice?.name.contains("Recording") == true ||
                           currentInputDevice?.channelCount ?? 0 > 2

    if isAggregateDevice {
      print("Detected potential aggregate device: \(currentInputDevice?.name ?? "Unknown")")
    } else {
      print("Standard input device detected: \(currentInputDevice?.name ?? "Unknown")")
    }

    // Install tap on input node - will capture whatever the input device provides
    inputNode.installTap(onBus: 0, bufferSize: 1024, format: inputFormat) {
      [weak self] buffer, _ in
      guard let self = self, let audioFile = self.audioFile else { return }

      do {
        try audioFile.write(from: buffer)
      } catch {
        print("Failed to write audio: \(error)")
      }
    }

    audioEngine.prepare()
    print("Audio engine configured for input capture from: \(currentInputDevice?.name ?? "Default")")
  }

  private func cleanup() {
    // Remove taps
    if audioEngine.inputNode.engine != nil {
      audioEngine.inputNode.removeTap(onBus: 0)
    }

    audioEngine.stop()
    audioEngine.reset()
    audioFile = nil
  }
}
