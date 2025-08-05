import SwiftUI

struct AudioSetupHelpView: View {
  var body: some View {
    ScrollView {
      VStack(alignment: .leading, spacing: 15) {
        Text("Audio Setup for Call Recording")
          .font(.title2)
          .bold()

        Text(
          "To record both your voice and other participants in calls, you need to set up an aggregate audio device that combines your microphone with system audio."
        )
        .font(.subheadline)
        .foregroundColor(.secondary)

        Divider()

        VStack(alignment: .leading, spacing: 12) {
          Text("Step 1: Open Audio MIDI Setup")
            .font(.headline)

          Text("• Open Finder → Applications → Utilities → Audio MIDI Setup")
          Text("• Or press Cmd+Space and search for 'Audio MIDI Setup'")

          Text("Step 2: Create Aggregate Device")
            .font(.headline)
            .padding(.top)

          Text("• Click the '+' button in the bottom left")
          Text("• Select 'Create Aggregate Device' from the menu")
          Text("• A new device called 'Aggregate Device' will appear")

          Text("Step 3: Configure the Aggregate Device")
            .font(.headline)
            .padding(.top)

          Text("• Rename it to something like 'Call Recording'")
          Text(
            "• Check the box next to your microphone (e.g., 'Built-in Microphone')"
          )
          Text(
            "• Check the box next to your output device (speakers/headphones)"
          )
          Text("• Make sure 'Drift Correction' is enabled for stable recording")
          Text("• Set the 'Main Device' to your microphone for best results")

          Text("Step 4: Important Notes")
            .font(.headline)
            .padding(.top)

          Text(
            "• The aggregate device combines your microphone with system audio"
          )
          Text(
            "• This allows recording both sides of calls and video conferences"
          )
          Text("• Use headphones during recording to prevent audio feedback")
          Text(
            "• Test with a short recording first to verify both audio sources work"
          )

          Text("Step 5: Select in This App")
            .font(.headline)
            .padding(.top)

          Text("• Click 'Select Audio Device' in the main interface")
          Text("• Choose your aggregate device (e.g., 'Call Recording')")
          Text("• Start recording to capture both sides of your calls")
        }

        Divider()

        VStack(alignment: .leading, spacing: 8) {
          Text("Tips for Best Results")
            .font(.headline)

          Text("• Use headphones to prevent audio feedback")
          Text("• Test your setup with a short recording first")
          Text("• The aggregate device will show multiple channels in this app")
          Text(
            "• Built-in aggregate devices work reliably across all macOS versions"
          )

          Text("Troubleshooting")
            .font(.subheadline)
            .bold()
            .padding(.top, 8)

          Text(
            "• If no sound: Check that both devices are selected in the aggregate"
          )
          Text("• If feedback/echo: Use headphones or adjust volume levels")
          Text(
            "• If recording is silent: Verify the aggregate device is selected in this app"
          )
        }

        Divider()

        HStack {
          Image(systemName: "info.circle")
            .foregroundColor(.blue)
          Text(
            "This setup allows professional-quality call recording while maintaining audio quality and avoiding system conflicts."
          )
          .font(.caption)
          .foregroundColor(.secondary)
        }
      }
      .padding()
    }
    .frame(width: 550, height: 600)
  }
}

#Preview {
  AudioSetupHelpView()
}
