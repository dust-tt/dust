import AVFoundation
import CoreAudio

struct AudioDevice {
  let id: AudioDeviceID
  let name: String
  let isInput: Bool
  let channelCount: Int
}

class AudioDeviceManager {
  static let shared = AudioDeviceManager()

  private init() {}

  func getInputDevices() -> [AudioDevice] {
    var devices: [AudioDevice] = []

    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDevices,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return devices }

    let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)

    status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize,
      &deviceIDs
    )

    guard status == noErr else { return devices }

    for deviceID in deviceIDs {
      if let device = getDeviceInfo(deviceID: deviceID), device.isInput {
        devices.append(device)
      }
    }

    return devices
  }

  func getOutputDevices() -> [AudioDevice] {
    var devices: [AudioDevice] = []

    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDevices,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return devices }

    let deviceCount = Int(dataSize) / MemoryLayout<AudioDeviceID>.size
    var deviceIDs = [AudioDeviceID](repeating: 0, count: deviceCount)

    status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize,
      &deviceIDs
    )

    guard status == noErr else { return devices }

    for deviceID in deviceIDs {
      if let device = getOutputDeviceInfo(deviceID: deviceID) {
        devices.append(device)
      }
    }

    return devices
  }

  private func getOutputDeviceInfo(deviceID: AudioDeviceID) -> AudioDevice? {
    // Get device name
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyDeviceNameCFString,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return nil }

    var deviceName: CFString?
    status = withUnsafeMutablePointer(to: &deviceName) { pointer in
      AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &dataSize,
        pointer
      )
    }

    guard status == noErr, let name = deviceName as String? else { return nil }

    // Check if device has output streams
    propertyAddress.mSelector = kAudioDevicePropertyStreams
    propertyAddress.mScope = kAudioDevicePropertyScopeOutput

    status = AudioObjectGetPropertyDataSize(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    let hasOutput = status == noErr && dataSize > 0
    guard hasOutput else { return nil }

    // Get channel count for output
    var channelCount = 0
    propertyAddress.mSelector = kAudioDevicePropertyStreamConfiguration
    status = AudioObjectGetPropertyDataSize(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    if status == noErr && dataSize > 0 {
      let bufferListSize = Int(dataSize)
      let bufferListPtr = UnsafeMutableRawPointer.allocate(
        byteCount: bufferListSize,
        alignment: MemoryLayout<AudioBufferList>.alignment
      )
      defer { bufferListPtr.deallocate() }

      status = AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &dataSize,
        bufferListPtr
      )

      if status == noErr {
        let bufferList = bufferListPtr.assumingMemoryBound(
          to: AudioBufferList.self
        )
        let bufferCount = Int(bufferList.pointee.mNumberBuffers)
        if bufferCount > 0 {
          channelCount = Int(bufferList.pointee.mBuffers.mNumberChannels)
        }
      }
    }

    return AudioDevice(
      id: deviceID,
      name: name,
      isInput: false,  // This is an output device
      channelCount: channelCount
    )
  }

  func getDeviceInfo(deviceID: AudioDeviceID) -> AudioDevice? {
    // Get device name.
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyDeviceNameCFString,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return nil }

    var deviceName: CFString?
    status = withUnsafeMutablePointer(to: &deviceName) { pointer in
      AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &dataSize,
        pointer
      )
    }

    guard status == noErr, let name = deviceName as String? else { return nil }

    // Check if device has input streams.
    propertyAddress.mSelector = kAudioDevicePropertyStreams
    propertyAddress.mScope = kAudioDevicePropertyScopeInput

    status = AudioObjectGetPropertyDataSize(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    let hasInput = status == noErr && dataSize > 0

    // Get channel count.
    var channelCount = 0
    if hasInput {
      propertyAddress.mSelector = kAudioDevicePropertyStreamConfiguration
      status = AudioObjectGetPropertyDataSize(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &dataSize
      )

      if status == noErr && dataSize > 0 {
        let bufferListSize = Int(dataSize)
        let bufferListPtr = UnsafeMutableRawPointer.allocate(
          byteCount: bufferListSize,
          alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { bufferListPtr.deallocate() }

        status = AudioObjectGetPropertyData(
          deviceID,
          &propertyAddress,
          0,
          nil,
          &dataSize,
          bufferListPtr
        )

        if status == noErr {
          let bufferList = bufferListPtr.assumingMemoryBound(
            to: AudioBufferList.self
          )
          let bufferCount = Int(bufferList.pointee.mNumberBuffers)
          if bufferCount > 0 {
            channelCount = Int(bufferList.pointee.mBuffers.mNumberChannels)
          }
        }
      }
    }

    return AudioDevice(
      id: deviceID,
      name: name,
      isInput: hasInput,
      channelCount: channelCount
    )
  }

  func setDefaultInputDevice(_ device: AudioDevice) -> Bool {
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultInputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var deviceID = device.id
    let status = AudioObjectSetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      UInt32(MemoryLayout<AudioDeviceID>.size),
      &deviceID
    )

    return status == noErr
  }

  func getCurrentInputDevice() -> AudioDevice? {
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultInputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return nil }

    var deviceID: AudioDeviceID = 0
    status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize,
      &deviceID
    )

    guard status == noErr else { return nil }

    return getDeviceInfo(deviceID: deviceID)
  }

  func getCurrentOutputDevice() -> AudioDevice? {
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize
    )

    guard status == noErr else { return nil }

    var deviceID: AudioDeviceID = 0
    status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      &dataSize,
      &deviceID
    )

    guard status == noErr else { return nil }

    return getDeviceInfo(deviceID: deviceID)
  }

  func setDefaultOutputDevice(_ device: AudioDevice) -> Bool {
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDefaultOutputDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var deviceID = device.id
    let status = AudioObjectSetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      0,
      nil,
      UInt32(MemoryLayout<AudioDeviceID>.size),
      &deviceID
    )

    return status == noErr
  }
}
