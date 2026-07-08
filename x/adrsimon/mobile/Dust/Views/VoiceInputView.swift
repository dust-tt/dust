import SparkleTokens
import SwiftUI

/// Full-screen voice capture. White canvas flooded with blue that swells with the speaker's
/// amplitude, a pulsing orb, the live transcript, and three controls: exit, record/stop, send.
struct VoiceInputView: View {
    @ObservedObject var viewModel: InputBarViewModel
    var onSend: () -> Void

    private var speech: SpeechService {
        viewModel.speechService
    }

    private var isBusy: Bool {
        speech.isRecording || speech.isFinalizing
    }

    var body: some View {
        ZStack {
            VoiceFloodBackground(level: speech.audioLevel, active: speech.isRecording)

            VStack(spacing: 0) {
                Spacer(minLength: 16)
                transcript
                Spacer(minLength: 16)
                VoicePulse(level: speech.audioLevel, active: speech.isRecording)
                    .frame(width: 220, height: 220)
                Spacer(minLength: 16)
                Text(statusText)
                    .sparkleLabelSm()
                    .foregroundStyle(speech.error == nil ? Color.primary500 : Color.dustForegroundWarning)
                    .multilineTextAlignment(.center)
                Spacer(minLength: 36)
                controls
            }
            .padding(.horizontal, 28)
            .padding(.top, 24)
            .padding(.bottom, 28)
        }
        .onAppear { viewModel.startVoiceInput() }
    }

    // MARK: - Transcript

    @ViewBuilder
    private var transcript: some View {
        if !viewModel.messageText.isEmpty {
            ScrollViewReader { proxy in
                ScrollView {
                    Text(viewModel.messageText)
                        .sparkleCopyLg()
                        .foregroundStyle(Color.dustForeground)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    // Anchor we keep scrolled into view so the latest tokens stay visible.
                    Color.clear.frame(height: 1).id(transcriptBottomID)
                }
                .frame(maxHeight: 220)
                .onChange(of: viewModel.messageText) { _, _ in
                    withAnimation(.easeOut(duration: 0.2)) {
                        proxy.scrollTo(transcriptBottomID, anchor: .bottom)
                    }
                }
            }
        }
    }

    private var transcriptBottomID: String {
        "transcript-bottom"
    }

    private var statusText: String {
        if let error = speech.error { return error }
        if speech.isFinalizing { return "Finishing up…" }
        if speech.isRecording { return "Listening…" }
        return viewModel.messageText.isEmpty ? "Tap to speak" : "Paused — send or keep recording"
    }

    // MARK: - Controls

    private var controls: some View {
        HStack {
            sideButton(
                icon: .arrowDown,
                tint: Color.dustForeground,
                fill: Color.primary100,
                enabled: !isBusy
            ) { viewModel.exitVoiceInput() }

            Spacer()

            recordButton

            Spacer()

            sideButton(
                icon: .arrowUp,
                tint: .white,
                fill: Color.highlight,
                enabled: !isBusy && viewModel.canSend
            ) { onSend() }
        }
    }

    private var recordButton: some View {
        Button {
            if speech.isRecording {
                viewModel.stopVoiceInput()
            } else {
                viewModel.startVoiceInput()
            }
        } label: {
            ZStack {
                Circle()
                    .fill(Color.highlight)
                    .frame(width: 78, height: 78)
                    .shadow(color: Color.highlight.opacity(0.4), radius: 14, y: 4)
                if speech.isRecording {
                    RoundedRectangle(cornerRadius: 6)
                        .fill(.white)
                        .frame(width: 26, height: 26)
                } else {
                    SparkleIcon.mic.image
                        .resizable()
                        .scaledToFit()
                        .frame(width: 30, height: 30)
                        .foregroundStyle(.white)
                }
            }
        }
        .disabled(speech.isFinalizing)
        .opacity(speech.isFinalizing ? 0.5 : 1)
    }

    private func sideButton(
        icon: SparkleIcon,
        tint: Color,
        fill: Color,
        enabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .fill(fill)
                    .frame(width: 58, height: 58)
                icon.image
                    .resizable()
                    .scaledToFit()
                    .frame(width: 20, height: 20)
                    .foregroundStyle(tint)
            }
        }
        .disabled(!enabled)
        .opacity(enabled ? 1 : 0.35)
    }
}

// MARK: - Blue flood background

private struct VoiceFloodBackground: View {
    let level: Float
    let active: Bool

    @State private var drift = false

    var body: some View {
        let amplitude = active ? CGFloat(min(max(level, 0), 1)) : 0
        GeometryReader { geo in
            ZStack {
                Color.dustBackground
                blob(
                    Color.blue200,
                    cx: 0.22,
                    cy: 0.28,
                    size: 0.9,
                    amplitude: amplitude,
                    geo: geo,
                    sway: drift ? 18 : -18
                )
                blob(
                    Color.blue100,
                    cx: 0.82,
                    cy: 0.42,
                    size: 1.0,
                    amplitude: amplitude,
                    geo: geo,
                    sway: drift ? -22 : 22
                )
                blob(
                    Color.highlight200,
                    cx: 0.5,
                    cy: 0.8,
                    size: 1.1,
                    amplitude: amplitude,
                    geo: geo,
                    sway: drift ? 14 : -14
                )
            }
            .animation(.easeOut(duration: 0.25), value: amplitude)
        }
        .ignoresSafeArea()
        .onAppear {
            withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) {
                drift = true
            }
        }
    }

    private func blob(
        _ color: Color,
        cx: CGFloat,
        cy: CGFloat,
        size: CGFloat,
        amplitude: CGFloat,
        geo: GeometryProxy,
        sway: CGFloat
    ) -> some View {
        let dimension = geo.size.width * size
        return Circle()
            .fill(
                RadialGradient(
                    colors: [color.opacity(0.5 + Double(amplitude) * 0.4), color.opacity(0)],
                    center: .center,
                    startRadius: 0,
                    endRadius: dimension / 2
                )
            )
            .frame(width: dimension, height: dimension)
            .scaleEffect(0.75 + amplitude * 0.5)
            .position(x: geo.size.width * cx + sway, y: geo.size.height * cy + sway)
            .blur(radius: 40)
    }
}

// MARK: - Pulsing orb

private struct VoicePulse: View {
    let level: Float
    let active: Bool

    @State private var ripple = false

    var body: some View {
        let amplitude = active ? CGFloat(min(max(level, 0), 1)) : 0
        ZStack {
            if active {
                ForEach(0 ..< 3, id: \.self) { index in
                    Circle()
                        .stroke(Color.highlight.opacity(0.25 - Double(index) * 0.07), lineWidth: 2)
                        .frame(width: 120, height: 120)
                        .scaleEffect((ripple ? 1.9 : 1.0) + amplitude * 0.6)
                        .opacity(ripple ? 0 : 0.8)
                        .animation(
                            .easeOut(duration: 2.4)
                                .repeatForever(autoreverses: false)
                                .delay(Double(index) * 0.8),
                            value: ripple
                        )
                }
            }
            Circle()
                .fill(
                    RadialGradient(
                        colors: [Color.highlight, Color.highlight600],
                        center: .center,
                        startRadius: 4,
                        endRadius: 70
                    )
                )
                .frame(width: 120, height: 120)
                .scaleEffect(1 + amplitude * 0.5)
                .shadow(color: Color.highlight.opacity(0.5), radius: 24 + amplitude * 30)
                .animation(.easeOut(duration: 0.2), value: amplitude)
        }
        .onAppear { ripple = true }
    }
}
