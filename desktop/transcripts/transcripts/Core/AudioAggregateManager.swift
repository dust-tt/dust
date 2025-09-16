import AVFoundation
import CoreAudio

class AudioAggregateManager {
  static let shared = AudioAggregateManager()

  private init() {}

  private let aggregateDeviceName = "Transcripts Call Recording"
  private var createdAggregateDeviceID: AudioDeviceID?

  func createAggregateDevice(
    inputDevice: AudioDevice,
    outputDevice: AudioDevice
  ) -> AudioDevice? {
    // Clean up any existing aggregate device first
    cleanupAggregateDevice()

    print(
      "[AudioAggregateManager] Creating aggregate device with input: \(inputDevice.name), output: \(outputDevice.name)"
    )

    // Get device UIDs first
    guard let inputUID = getDeviceUID(deviceID: inputDevice.id),
      let outputUID = getDeviceUID(deviceID: outputDevice.id)
    else {
      print("Failed to get device UIDs")
      return nil
    }

    print(
      "[AudioAggregateManager] Input UID: \(inputUID), Output UID: \(outputUID)"
    )

    // Try the new plugin approach with proper entitlements
    if let deviceID = createUsingPluginApproach(
      inputUID: inputUID,
      outputUID: outputUID
    ) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0)

      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(
        deviceID: deviceID
      ) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }

    // Try the direct CFDictionary approach
    if let deviceID = createUsingCFDictionary(
      inputUID: inputUID,
      outputUID: outputUID
    ) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0)  // Wait longer for device creation

      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(
        deviceID: deviceID
      ) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }

    // Try the AudioSystemObject approach
    if let deviceID = createUsingAudioSystemObject(
      inputUID: inputUID,
      outputUID: outputUID
    ) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0)

      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(
        deviceID: deviceID
      ) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }

    print(
      "[AudioAggregateManager] INFO: Aggregate device creation not supported in current environment"
    )
    print(
      "[AudioAggregateManager] This is expected for sandboxed apps without special entitlements"
    )
    print("[AudioAggregateManager] Falling back to input device only")
    return nil
  }

  private func createUsingCFDictionary(inputUID: String, outputUID: String)
    -> AudioDeviceID?
  {
    let subDeviceList = [
      [
        kAudioSubDeviceUIDKey as String: inputUID,
        kAudioSubDeviceDriftCompensationKey as String: true,
      ],
      [
        kAudioSubDeviceUIDKey as String: outputUID,
        kAudioSubDeviceDriftCompensationKey as String: true,
      ],
    ]

    let description =
      [
        kAudioAggregateDeviceNameKey as String: aggregateDeviceName,
        kAudioAggregateDeviceUIDKey as String:
          "com.transcripts.callrecording.\(UUID().uuidString)",
        kAudioAggregateDeviceSubDeviceListKey as String: subDeviceList,
        kAudioAggregateDeviceMasterSubDeviceKey as String: inputUID,
        kAudioAggregateDeviceClockDeviceKey as String: inputUID,
      ] as CFDictionary

    var deviceID: AudioDeviceID = 0
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioPlugInCreateAggregateDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    let inSize = UInt32(MemoryLayout<CFDictionary>.size)
    var outSize = UInt32(MemoryLayout<AudioDeviceID>.size)

    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      inSize,
      withUnsafePointer(to: description) { $0 },
      &outSize,
      &deviceID
    )

    print(
      "[AudioAggregateManager] CFDictionary approach status: \(status) (\(status == noErr ? "SUCCESS" : "FAILED")), deviceID: \(deviceID)"
    )
    return status == noErr && deviceID != 0 ? deviceID : nil
  }

  private func createUsingPluginApproach(inputUID: String, outputUID: String)
    -> AudioDeviceID?
  {
    // This approach uses the HAL plugin system with proper entitlements
    let pluginBundleID = "com.apple.audio.CoreAudio"

    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyPlugInForBundleID,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    var pluginID: AudioObjectID = 0
    var dataSize = UInt32(MemoryLayout<AudioObjectID>.size)
    let bundleIDCF = pluginBundleID as CFString
    let bundleIDSize = UInt32(MemoryLayout<CFString>.size)

    // Get the Core Audio plugin
    var status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      bundleIDSize,
      withUnsafePointer(to: bundleIDCF) { $0 },
      &dataSize,
      &pluginID
    )

    print(
      "[AudioAggregateManager] Plugin lookup status: \(status) (\(status == noErr ? "SUCCESS" : "FAILED")), pluginID: \(pluginID)"
    )

    if status == noErr && pluginID != 0 {
      // Create aggregate device using the plugin
      let subDeviceList = [
        [
          kAudioSubDeviceUIDKey as String: inputUID,
          kAudioSubDeviceDriftCompensationKey as String: true,
        ],
        [
          kAudioSubDeviceUIDKey as String: outputUID,
          kAudioSubDeviceDriftCompensationKey as String: true,
        ],
      ]

      let description =
        [
          kAudioAggregateDeviceNameKey as String: aggregateDeviceName,
          kAudioAggregateDeviceUIDKey as String:
            "com.transcripts.callrecording.\(UUID().uuidString)",
          kAudioAggregateDeviceSubDeviceListKey as String: subDeviceList,
          kAudioAggregateDeviceMasterSubDeviceKey as String: inputUID,
          kAudioAggregateDeviceClockDeviceKey as String: inputUID,
          kAudioAggregateDeviceIsPrivateKey as String: false,
        ] as CFDictionary

      var deviceID: AudioDeviceID = 0
      propertyAddress.mSelector = kAudioPlugInCreateAggregateDevice

      let inSize = UInt32(MemoryLayout<CFDictionary>.size)

      status = AudioObjectGetPropertyData(
        pluginID,
        &propertyAddress,
        inSize,
        withUnsafePointer(to: description) { $0 },
        &dataSize,
        &deviceID
      )

      print(
        "[AudioAggregateManager] Plugin aggregate creation status: \(status) (\(status == noErr ? "SUCCESS" : "FAILED")), deviceID: \(deviceID)"
      )
      return status == noErr && deviceID != 0 ? deviceID : nil
    }

    return nil
  }

  private func createUsingAudioSystemObject(inputUID: String, outputUID: String)
    -> AudioDeviceID?
  {
    // Try using AudioHardwareCreateAggregateDevice if available
    let description =
      [
        kAudioAggregateDeviceNameKey: aggregateDeviceName,
        kAudioAggregateDeviceUIDKey:
          "com.transcripts.callrecording.\(UUID().uuidString)",
        kAudioAggregateDeviceSubDeviceListKey: [
          [kAudioSubDeviceUIDKey: inputUID],
          [kAudioSubDeviceUIDKey: outputUID],
        ],
      ] as [String: Any]

    print(
      "Attempting AudioSystemObject creation with description: \(description)"
    )

    // This approach uses the system object differently
    var deviceID: AudioDeviceID = 0
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioHardwarePropertyDevices,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )

    // Try to create via property manipulation
    propertyAddress.mSelector = kAudioPlugInCreateAggregateDevice

    let nsDict = description as NSDictionary
    let dictSize = UInt32(MemoryLayout<NSDictionary>.size)
    var deviceSize = UInt32(MemoryLayout<AudioDeviceID>.size)

    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      dictSize,
      withUnsafePointer(to: nsDict) { $0 },
      &deviceSize,
      &deviceID
    )

    print(
      "[AudioAggregateManager] AudioSystemObject approach status: \(status) (\(status == noErr ? "SUCCESS" : "FAILED")), deviceID: \(deviceID)"
    )
    return status == noErr && deviceID != 0 ? deviceID : nil
  }

  func cleanupAggregateDevice() {
    if let deviceID = createdAggregateDeviceID {
      print(
        "[AudioAggregateManager] Attempting to cleanup aggregate device: \(deviceID)"
      )

      var propertyAddress = AudioObjectPropertyAddress(
        mSelector: kAudioPlugInDestroyAggregateDevice,
        mScope: kAudioObjectPropertyScopeGlobal,
        mElement: kAudioObjectPropertyElementMain
      )

      var deviceIDToDestroy = deviceID
      let status = AudioObjectSetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &propertyAddress,
        0,
        nil,
        UInt32(MemoryLayout<AudioDeviceID>.size),
        &deviceIDToDestroy
      )

      if status == noErr {
        print(
          "[AudioAggregateManager] Successfully cleaned up aggregate device"
        )
      } else {
        print(
          "[AudioAggregateManager] Failed to cleanup aggregate device, status: \(status)"
        )
      }
    }

    createdAggregateDeviceID = nil
    print("[AudioAggregateManager] Cleanup completed")
  }

  private func getDeviceUID(deviceID: AudioDeviceID) -> String? {
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioDevicePropertyDeviceUID,
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

    var deviceUID: CFString?
    status = withUnsafeMutablePointer(to: &deviceUID) { pointer in
      AudioObjectGetPropertyData(
        deviceID,
        &propertyAddress,
        0,
        nil,
        &dataSize,
        pointer
      )
    }

    guard status == noErr, let uid = deviceUID else { return nil }
    return uid as String
  }
}
