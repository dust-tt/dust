import SwiftUI

struct ContentView: View {
    @StateObject private var audioRecorder = AudioRecorder()
    @State private var hasPermission = false
    
    var body: some View {
        VStack(spacing: 8) {
            Image("DustLogo")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: 32)
        
            Button(action: startRecording) {
                HStack {
                    Image(systemName: "record.circle")
                    Text("Start Recording")
                }
            }
            .disabled(audioRecorder.isRecording || !hasPermission)
            
            Button(action: stopRecording) {
                HStack {
                    Image(systemName: "stop.circle")
                    Text("Stop Recording")
                }
            }
            .disabled(!audioRecorder.isRecording)

            
            Divider()
            
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding()
        .onAppear {
            requestMicrophonePermission()
        }
    }
    
    private func requestMicrophonePermission() {
        Task {
            hasPermission = await audioRecorder.requestPermission()
        }
    }
    
    private func startRecording() {
        audioRecorder.startRecording()
    }
    
    private func stopRecording() {
        audioRecorder.stopRecording()
        
        if let url = audioRecorder.recordingURL {
            print("Recording saved to: \(url)")
            // Handle the recorded file here
        }
    }
}

#Preview {
    ContentView()
}
