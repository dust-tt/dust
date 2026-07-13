package com.dust.mobile.android.audio

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Process
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.sqrt

class AndroidSpeechRecorder {
    @Volatile
    private var isCapturing = false
    private var recorder: AudioRecord? = null
    private var captureThread: Thread? = null

    @SuppressLint("MissingPermission")
    fun start(onAudio: (ByteArray, Float) -> Unit) {
        stop()
        val minimumBufferSize = AudioRecord.getMinBufferSize(
            ScribeRealtimeClient.SAMPLE_RATE_HZ,
            AudioFormat.CHANNEL_IN_MONO,
            AudioFormat.ENCODING_PCM_16BIT,
        )
        check(minimumBufferSize > 0) { "Microphone is not available" }
        val bufferSize = max(minimumBufferSize, ScribeRealtimeClient.SAMPLE_RATE_HZ / 5 * 2)
        val audioRecord = AudioRecord.Builder()
            .setAudioSource(MediaRecorder.AudioSource.MIC)
            .setAudioFormat(
                AudioFormat.Builder()
                    .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
                    .setSampleRate(ScribeRealtimeClient.SAMPLE_RATE_HZ)
                    .setChannelMask(AudioFormat.CHANNEL_IN_MONO)
                    .build(),
            )
            .setBufferSizeInBytes(bufferSize)
            .build()
        check(audioRecord.state == AudioRecord.STATE_INITIALIZED) {
            audioRecord.release()
            "Failed to initialize microphone"
        }
        audioRecord.startRecording()
        recorder = audioRecord
        isCapturing = true
        captureThread = thread(name = "dust-scribe-audio") {
            Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)
            val buffer = ByteArray(bufferSize)
            while (isCapturing) {
                val count = audioRecord.read(buffer, 0, buffer.size)
                if (count > 0) {
                    val chunk = buffer.copyOf(count)
                    onAudio(chunk, pcmAudioLevel(chunk))
                }
            }
        }
    }

    fun stop() {
        isCapturing = false
        val audioRecord = recorder
        recorder = null
        runCatching { audioRecord?.stop() }
        captureThread?.join(500)
        captureThread = null
        audioRecord?.release()
    }
}

internal fun pcmAudioLevel(data: ByteArray): Float {
    if (data.size < 2) return 0f
    var sumSquares = 0.0
    var sampleCount = 0
    var index = 0
    while (index + 1 < data.size) {
        val sample = ((data[index + 1].toInt() shl 8) or (data[index].toInt() and 0xff)).toShort().toInt()
        sumSquares += sample.toDouble() * sample
        sampleCount += 1
        index += 2
    }
    val rms = sqrt(sumSquares / sampleCount.coerceAtLeast(1))
    return ((rms / Short.MAX_VALUE) * 8.0).toFloat().coerceIn(0f, 1f)
}
