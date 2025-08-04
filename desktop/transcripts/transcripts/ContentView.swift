import SwiftUI

struct ContentView: View {
    @State private var isRecording = false
    
    var body: some View {
        VStack(spacing: 8) {
            Button(action: startRecording) {
                HStack {
                    Image(systemName: "record.circle")
                    Text("Start Recording")
                }
            }
            .disabled(isRecording)
            
            Button(action: stopRecording) {
                HStack {
                    Image(systemName: "stop.circle")
                    Text("Stop Recording")
                }
            }
            .disabled(!isRecording)

            
            Divider()
            
            Button("Quit") {
                NSApplication.shared.terminate(nil)
            }
        }
        .padding()
    }
    
    private func startRecording() {
        isRecording = true
        // Recording implementation will go here
    }
    
    private func stopRecording() {
        isRecording = false
        // Stop recording implementation will go here
    }
}

#Preview {
    ContentView()
}
