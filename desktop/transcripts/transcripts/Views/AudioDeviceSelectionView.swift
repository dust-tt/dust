import SwiftUI

struct AudioDeviceSelectionView: View {
  @State private var availableDevices: [AudioDevice] = []
  @State private var selectedDevice: AudioDevice?
  let onDeviceSelected: (AudioDevice) -> Void
  let onClose: () -> Void

  var body: some View {
    VStack(spacing: 15) {
      Text("Select Audio Input Device")
        .font(.headline)

      Text(
        "Choose the audio device to record from. For call recording, select an aggregate device that includes both microphone and system audio."
      )
      .font(.caption)
      .multilineTextAlignment(.center)
      .foregroundColor(.secondary)

      ScrollView {
        LazyVStack(spacing: 8) {
          ForEach(availableDevices, id: \.id) { device in
            HStack {
              VStack(alignment: .leading, spacing: 2) {
                Text(device.name)
                  .font(.system(size: 13))

                Text("\(device.channelCount) channel(s)")
                  .font(.caption2)
                  .foregroundColor(.secondary)
              }

              Spacer()

              if selectedDevice?.id == device.id {
                Image(systemName: "checkmark.circle.fill")
                  .foregroundColor(.blue)
              } else {
                Image(systemName: "circle")
                  .foregroundColor(.secondary)
              }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(
              RoundedRectangle(cornerRadius: 6)
                .fill(
                  selectedDevice?.id == device.id
                    ? Color.blue.opacity(0.1) : Color.clear
                )
            )
            .contentShape(Rectangle())
            .onTapGesture {
              selectedDevice = device
              onDeviceSelected(device)
            }
          }
        }
      }
      .frame(maxHeight: 200)

      if let currentDevice = AudioDeviceManager.shared.getCurrentInputDevice() {
        Text("Current: \(currentDevice.name)")
          .font(.caption2)
          .foregroundColor(.secondary)
      }

      Button("Close") {
        onClose()
      }
      .keyboardShortcut(.cancelAction)
    }
    .frame(width: 450, height: 350)
    .padding()
    .onAppear {
      loadDevices()
    }
  }

  private func loadDevices() {
    availableDevices = AudioDeviceManager.shared.getInputDevices()
    selectedDevice = AudioDeviceManager.shared.getCurrentInputDevice()
  }
}

#Preview {
  AudioDeviceSelectionView(
    onDeviceSelected: { _ in },
    onClose: {}
  )
}
