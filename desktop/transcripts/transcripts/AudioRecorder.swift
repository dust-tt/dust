import AVFoundation
import Foundation

class AudioRecorder: ObservableObject {
  private var audioRecorder: AVAudioRecorder?

  @Published var isRecording = false
  @Published var recordingURL: URL?

  func requestPermission() async -> Bool {
    await withCheckedContinuation { continuation in
      AVCaptureDevice.requestAccess(for: .audio) { granted in
        continuation.resume(returning: granted)
      }
    }
  }

  func startRecording() {
    guard !isRecording else { return }

    let documentsPath = FileManager.default.urls(
      for: .documentDirectory,
      in: .userDomainMask
    )[0]
    let audioFilename = documentsPath.appendingPathComponent(
      "recording_\(Date().timeIntervalSince1970).m4a"
    )

    let settings =
      [
        AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
        AVSampleRateKey: 8000,
        AVNumberOfChannelsKey: 1,
        AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
      ] as [String: Any]

    do {
      audioRecorder = try AVAudioRecorder(
        url: audioFilename,
        settings: settings
      )
      audioRecorder?.record()

      isRecording = true
      recordingURL = audioFilename
    } catch {
      print("Failed to start recording: \(error)")
    }
  }

  func stopRecording() {
    guard isRecording else { return }

    audioRecorder?.stop()
    audioRecorder = nil

    isRecording = false
  }
}
