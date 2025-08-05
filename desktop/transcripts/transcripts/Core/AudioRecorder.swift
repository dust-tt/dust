import AVFoundation
import Foundation

class AudioRecorder: ObservableObject {
  private var audioRecorder: AVAudioRecorder?
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

    // Create temporary file URL.
    let tempDir = FileManager.default.temporaryDirectory
    tempURL = tempDir.appendingPathComponent(
      "\(recordingId!)\(AudioSettings.audioFileExtension)"
    )

    let settings =
      [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: AudioSettings.audioSampleRate,
        AVNumberOfChannelsKey: AudioSettings.audioChannels,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      ] as [String: Any]

    do {
      audioRecorder = try AVAudioRecorder(url: tempURL!, settings: settings)
      audioRecorder?.isMeteringEnabled = false  // Disable metering to reduce overhead

      audioRecorder?.record()

      isRecording = true
      recordingData = nil
    } catch {
      print("Failed to start recording: \(error)")
    }
  }

  func stopRecording() {
    guard isRecording else { return }

    audioRecorder?.stop()
    audioRecorder = nil
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
}
