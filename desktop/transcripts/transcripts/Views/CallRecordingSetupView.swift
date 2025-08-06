import CoreAudio
import SwiftUI

struct CallRecordingSetupView: View {
  @State private var inputDevices: [AudioDevice] = []
  @State private var outputDevices: [AudioDevice] = []
  @State private var selectedInputDevice: AudioDevice?
  @State private var selectedOutputDevice: AudioDevice?
  @State private var isCreatingAggregate = false
  @State private var setupError: String?

  let onSetupComplete: (AudioDevice) -> Void
  let onCancel: () -> Void

  var body: some View {
    VStack(spacing: 20) {
      Text("Select Audio Devices")
        .font(.title2)
        .bold()

      // Input Device Selection
      VStack(alignment: .leading, spacing: 12) {
        Text("Input Devices (Microphone)")
          .font(.headline)

        ScrollView {
          LazyVStack(spacing: 6) {
            ForEach(inputDevices, id: \.id) { device in
              HStack {
                deviceRow(
                  device: device,
                  isSelected: selectedInputDevice?.id == device.id
                ) {
                  selectedInputDevice = device
                }
              }
            }
          }
        }
        .frame(height: 150)
        .background(Color(.controlBackgroundColor))
        .cornerRadius(8)
      }
      .frame(width: 450)

      // Output Device Selection
      VStack(alignment: .leading, spacing: 12) {
        Text("Output Devices (Speakers)")
          .font(.headline)

        ScrollView {
          LazyVStack(spacing: 6) {
            ForEach(outputDevices, id: \.id) { device in
              HStack {
                deviceRow(
                  device: device,
                  isSelected: selectedOutputDevice?.id == device.id
                ) {
                  selectedOutputDevice = device
                }
              }
            }
          }
        }
        .frame(height: 120)
        .background(Color(.controlBackgroundColor))
        .cornerRadius(8)
      }
      .frame(width: 450)

      if let error = setupError {
        Text(error)
          .foregroundColor(.red)
          .font(.caption)
      }

      HStack(spacing: 20) {
        Button("Cancel") {
          onCancel()
        }
        .keyboardShortcut(.cancelAction)

        Button("Apply Settings") {
          setRecordingDevice()
        }
        .keyboardShortcut(.defaultAction)
        .disabled(selectedInputDevice == nil || isCreatingAggregate)
      }

      if isCreatingAggregate {
        HStack {
          ProgressView()
            .scaleEffect(0.5)
          Text("Creating audio setup...")
            .font(.caption)
            .foregroundColor(.secondary)
        }
      }
    }
    .frame(width: 500, height: 550)
    .padding()
    .onAppear {
      loadDevices()
    }
  }

  private func deviceRow(
    device: AudioDevice,
    isSelected: Bool,
    onSelect: @escaping () -> Void
  ) -> some View {
    HStack {
      VStack(alignment: .leading, spacing: 2) {
        HStack {
          Text(device.name)
            .font(.system(size: 12))
            .lineLimit(1)

          if isDefaultDevice(device) {
            Text("(Default)")
              .font(.caption2)
              .foregroundColor(.orange)
              .bold()
          }
        }

        Text("\(device.channelCount) ch")
          .font(.caption2)
          .foregroundColor(.secondary)
      }

      Spacer()

      if isSelected {
        Image(systemName: "checkmark.circle.fill")
          .foregroundColor(.blue)
          .font(.system(size: 14))
      }
    }
    .padding(.horizontal, 8)
    .padding(.vertical, 4)
    .background(
      RoundedRectangle(cornerRadius: 4)
        .fill(isSelected ? Color.blue.opacity(0.1) : Color.clear)
    )
    .contentShape(Rectangle())
    .onTapGesture {
      onSelect()
    }
  }

  private func isDefaultDevice(_ device: AudioDevice) -> Bool {
    if device.isInput {
      return AudioDeviceManager.shared.getCurrentInputDevice()?.id == device.id
    } else {
      return AudioDeviceManager.shared.getCurrentOutputDevice()?.id == device.id
    }
  }

  private func loadDevices() {
    inputDevices = AudioDeviceManager.shared.getInputDevices()
    outputDevices = AudioDeviceManager.shared.getOutputDevices()

    // Pre-select current default devices
    selectedInputDevice = AudioDeviceManager.shared.getCurrentInputDevice()
    selectedOutputDevice = AudioDeviceManager.shared.getCurrentOutputDevice()
  }

  private func setRecordingDevice() {
    guard let inputDevice = selectedInputDevice else { return }

    isCreatingAggregate = true
    setupError = nil

    DispatchQueue.global(qos: .userInitiated).async {
      // If we have both input and output devices selected, try to create aggregate device
      if let outputDevice = self.selectedOutputDevice,
        !inputDevice.name.localizedCaseInsensitiveContains("aggregate")
      {

        print(
          "[CallRecordingSetup] Attempting to create aggregate device with input: \(inputDevice.name), output: \(outputDevice.name)"
        )
        if let aggregateDevice = AudioAggregateManager.shared
          .createAggregateDevice(
            inputDevice: inputDevice,
            outputDevice: outputDevice
          )
        {
          // Successfully created aggregate device
          if AudioDeviceManager.shared.setDefaultInputDevice(aggregateDevice) {
            DispatchQueue.main.async {
              self.isCreatingAggregate = false
              self.onSetupComplete(aggregateDevice)
            }
            return
          } else {
            DispatchQueue.main.async {
              self.isCreatingAggregate = false
              self.setupError =
                "Created aggregate device but failed to set as default."
            }
            return
          }
        } else {
          print(
            "[CallRecordingSetup] Aggregate device not supported in sandboxed environment, using input device only"
          )
        }
      }

      // Fallback: just set the input device as default
      if AudioDeviceManager.shared.setDefaultInputDevice(inputDevice) {
        DispatchQueue.main.async {
          self.isCreatingAggregate = false
          self.onSetupComplete(inputDevice)
        }
      } else {
        DispatchQueue.main.async {
          self.isCreatingAggregate = false
          self.setupError = "Failed to set recording device."
        }
      }
    }
  }
}

#Preview {
  CallRecordingSetupView(
    onSetupComplete: { _ in },
    onCancel: {}
  )
}
