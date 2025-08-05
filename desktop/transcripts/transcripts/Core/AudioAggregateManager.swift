import AVFoundation
import CoreAudio

class AudioAggregateManager {
  static let shared = AudioAggregateManager()
  
  private init() {}
  
  private let aggregateDeviceName = "Transcripts Call Recording"
  private var createdAggregateDeviceID: AudioDeviceID?
  
  func createAggregateDevice(inputDevice: AudioDevice, outputDevice: AudioDevice) -> AudioDevice? {
    // Clean up any existing aggregate device first
    cleanupAggregateDevice()
    
    print("Creating aggregate device with input: \(inputDevice.name), output: \(outputDevice.name)")
    
    // Get device UIDs first
    guard let inputUID = getDeviceUID(deviceID: inputDevice.id),
          let outputUID = getDeviceUID(deviceID: outputDevice.id) else {
      print("Failed to get device UIDs")
      return nil
    }
    
    print("Input UID: \(inputUID), Output UID: \(outputUID)")
    
    // Try the new plugin approach with proper entitlements
    if let deviceID = createUsingPluginApproach(inputUID: inputUID, outputUID: outputUID) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0)
      
      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(deviceID: deviceID) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }
    
    // Try the direct CFDictionary approach
    if let deviceID = createUsingCFDictionary(inputUID: inputUID, outputUID: outputUID) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0) // Wait longer for device creation
      
      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(deviceID: deviceID) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }
    
    // Try the AudioSystemObject approach
    if let deviceID = createUsingAudioSystemObject(inputUID: inputUID, outputUID: outputUID) {
      createdAggregateDeviceID = deviceID
      Thread.sleep(forTimeInterval: 2.0)
      
      if let deviceInfo = AudioDeviceManager.shared.getDeviceInfo(deviceID: deviceID) {
        print("Successfully created aggregate device: \(deviceInfo.name)")
        return deviceInfo
      }
    }
    
    print("All aggregate device creation methods failed")
    return nil
  }
  
  private func createUsingCFDictionary(inputUID: String, outputUID: String) -> AudioDeviceID? {
    let subDeviceList = [
      [
        kAudioSubDeviceUIDKey as String: inputUID,
        kAudioSubDeviceDriftCompensationKey as String: true
      ],
      [
        kAudioSubDeviceUIDKey as String: outputUID,
        kAudioSubDeviceDriftCompensationKey as String: true
      ]
    ]
    
    let description = [
      kAudioAggregateDeviceNameKey as String: aggregateDeviceName,
      kAudioAggregateDeviceUIDKey as String: "com.transcripts.callrecording.\(UUID().uuidString)",
      kAudioAggregateDeviceSubDeviceListKey as String: subDeviceList,
      kAudioAggregateDeviceMasterSubDeviceKey as String: inputUID,
      kAudioAggregateDeviceClockDeviceKey as String: inputUID
    ] as CFDictionary
    
    var deviceID: AudioDeviceID = 0
    var propertyAddress = AudioObjectPropertyAddress(
      mSelector: kAudioPlugInCreateAggregateDevice,
      mScope: kAudioObjectPropertyScopeGlobal,
      mElement: kAudioObjectPropertyElementMain
    )
    
    var inSize = UInt32(MemoryLayout<CFDictionary>.size)
    var outSize = UInt32(MemoryLayout<AudioDeviceID>.size)
    
    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      inSize,
      withUnsafePointer(to: description) { $0 },
      &outSize,
      &deviceID
    )
    
    print("CFDictionary approach status: \(status), deviceID: \(deviceID)")
    return status == noErr && deviceID != 0 ? deviceID : nil
  }
  
  private func createUsingPluginApproach(inputUID: String, outputUID: String) -> AudioDeviceID? {
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
    var bundleIDSize = UInt32(MemoryLayout<CFString>.size)
    
    // Get the Core Audio plugin
    var status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      bundleIDSize,
      withUnsafePointer(to: bundleIDCF) { $0 },
      &dataSize,
      &pluginID
    )
    
    print("Plugin lookup status: \(status), pluginID: \(pluginID)")
    
    if status == noErr && pluginID != 0 {
      // Create aggregate device using the plugin
      let subDeviceList = [
        [
          kAudioSubDeviceUIDKey as String: inputUID,
          kAudioSubDeviceDriftCompensationKey as String: true
        ],
        [
          kAudioSubDeviceUIDKey as String: outputUID,
          kAudioSubDeviceDriftCompensationKey as String: true
        ]
      ]
      
      let description = [
        kAudioAggregateDeviceNameKey as String: aggregateDeviceName,
        kAudioAggregateDeviceUIDKey as String: "com.transcripts.callrecording.\(UUID().uuidString)",
        kAudioAggregateDeviceSubDeviceListKey as String: subDeviceList,
        kAudioAggregateDeviceMasterSubDeviceKey as String: inputUID,
        kAudioAggregateDeviceClockDeviceKey as String: inputUID,
        kAudioAggregateDeviceIsPrivateKey as String: false
      ] as CFDictionary
      
      var deviceID: AudioDeviceID = 0
      propertyAddress.mSelector = kAudioPlugInCreateAggregateDevice
      
      let inSize = UInt32(MemoryLayout<CFDictionary>.size)
      let outSize = UInt32(MemoryLayout<AudioDeviceID>.size)
      
      status = AudioObjectGetPropertyData(
        pluginID,
        &propertyAddress,
        inSize,
        withUnsafePointer(to: description) { $0 },
        &dataSize,
        &deviceID
      )
      
      print("Plugin aggregate creation status: \(status), deviceID: \(deviceID)")
      return status == noErr && deviceID != 0 ? deviceID : nil
    }
    
    return nil
  }
  
  private func createUsingAudioSystemObject(inputUID: String, outputUID: String) -> AudioDeviceID? {
    // Try using AudioHardwareCreateAggregateDevice if available
    let description = [
      kAudioAggregateDeviceNameKey: aggregateDeviceName,
      kAudioAggregateDeviceUIDKey: "com.transcripts.callrecording.\(UUID().uuidString)",
      kAudioAggregateDeviceSubDeviceListKey: [
        [kAudioSubDeviceUIDKey: inputUID],
        [kAudioSubDeviceUIDKey: outputUID]
      ]
    ] as [String: Any]
    
    print("Attempting AudioSystemObject creation with description: \(description)")
    
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
    var dictSize = UInt32(MemoryLayout<NSDictionary>.size)
    var deviceSize = UInt32(MemoryLayout<AudioDeviceID>.size)
    
    let status = AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &propertyAddress,
      dictSize,
      withUnsafePointer(to: nsDict) { $0 },
      &deviceSize,
      &deviceID
    )
    
    print("AudioSystemObject approach status: \(status), deviceID: \(deviceID)")
    return status == noErr && deviceID != 0 ? deviceID : nil
  }
  
  
  func cleanupAggregateDevice() {
    // Since we're not actually creating aggregate devices programmatically anymore,
    // we don't need to clean them up
    createdAggregateDeviceID = nil
    print("Cleanup completed")
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
    status = AudioObjectGetPropertyData(
      deviceID,
      &propertyAddress,
      0,
      nil,
      &dataSize,
      &deviceUID
    )
    
    guard status == noErr, let uid = deviceUID else { return nil }
    return uid as String
  }
}

