import Foundation

struct AudioSettings {
  // Audio recording configuration.
  static let maxAudioFileSize = 25 * 1024 * 1024 // 25MB
  static let audioSampleRate = 24000
  static let audioChannels = 1
  static let recordingPrefix = "recording_"
  static let audioFileExtension = ".m4a"
  
  // Audio processing timing.
  static let recordingDataProcessingDelay: TimeInterval = 0.1
}
