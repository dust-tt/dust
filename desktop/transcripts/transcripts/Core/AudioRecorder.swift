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

    // Generate unique ID for this recording
    let recordingTimestamp = Int(Date().timeIntervalSince1970)
    recordingId = "recording_\(recordingTimestamp)"

    // Create temporary file URL for AVAudioRecorder
    let tempDir = FileManager.default.temporaryDirectory
    tempURL = tempDir.appendingPathComponent("\(recordingId!).m4a")

    let settings =
      [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 8000,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      ] as [String: Any]

    do {
      audioRecorder = try AVAudioRecorder(
        url: tempURL!,
        settings: settings
      )
      audioRecorder?.record()

      isRecording = true
      recordingData = nil  // Clear any previous data
    } catch {
      print("Failed to start recording: \(error)")
    }
  }

  func stopRecording() {
    guard isRecording else { return }

    audioRecorder?.stop()
    audioRecorder = nil
    isRecording = false

    // Load the audio data into memory and clean up temp file
    if let tempURL = tempURL {
      do {
        recordingData = try Data(contentsOf: tempURL)
        // Clean up temporary file
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
