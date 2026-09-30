package expo.modules.audiodecoder

import android.media.AudioFormat
import android.media.MediaCodec
import android.media.MediaExtractor
import android.media.MediaFormat
import expo.modules.kotlin.exception.CodedException
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.ShortBuffer
import kotlin.math.roundToInt

private const val TARGET_SAMPLE_RATE = 16_000
private const val WAV_HEADER_BYTES = 44
private const val OUTPUT_TIMEOUT_US = 10_000L

// A healthy codec makes progress within a few milliseconds; about ten seconds without any means
// it is stuck, and waiting longer would hang the run.
private const val MAX_IDLE_ROUNDS = 1_000

/**
 * Decodes any audio file MediaCodec can read (the recorder writes AAC in M4A) into a 16 kHz mono
 * 16-bit PCM WAV, which is the only input whisper.cpp accepts. Streams in small buffers so memory
 * stays flat for any chunk length. Returns the duration of the written audio in milliseconds.
 * Throws InvalidAudioException for a file that cannot be opened as audio or that decodes to no
 * frames, and DecodeFailedException for every other failure. No partial output is left behind on
 * failure.
 */
internal fun transcodeToWav(inputPath: String, outputPath: String): Int {
  val output = File(outputPath)
  var succeeded = false
  try {
    if (!output.name.endsWith(".wav", ignoreCase = true) || !File(inputPath).isFile) {
      throw DecodeFailedException()
    }
    val frames = WavSink(output).use { sink ->
      decode(inputPath, sink)
      if (sink.frames == 0L) {
        throw InvalidAudioException()
      }
      sink.finish()
      sink.frames
    }
    succeeded = true
    return (frames * 1000.0 / TARGET_SAMPLE_RATE).roundToInt()
  } catch (error: CodedException) {
    throw error
  } catch (error: Exception) {
    throw DecodeFailedException(error)
  } finally {
    if (!succeeded) {
      output.delete()
    }
  }
}

private fun decode(inputPath: String, sink: WavSink) {
  val extractor = MediaExtractor()
  var codec: MediaCodec? = null
  try {
    try {
      extractor.setDataSource(inputPath)
    } catch (error: Exception) {
      throw InvalidAudioException(error)
    }
    val trackIndex = (0 until extractor.trackCount).firstOrNull { index ->
      extractor.getTrackFormat(index).getString(MediaFormat.KEY_MIME)?.startsWith("audio/") == true
    } ?: throw InvalidAudioException()
    extractor.selectTrack(trackIndex)
    val trackFormat = extractor.getTrackFormat(trackIndex)
    val mime = trackFormat.getString(MediaFormat.KEY_MIME) ?: throw InvalidAudioException()

    val decoder = try {
      MediaCodec.createDecoderByType(mime)
    } catch (error: Exception) {
      throw DecodeFailedException(error)
    }
    codec = decoder
    decoder.configure(trackFormat, null, null, 0)
    decoder.start()

    val info = MediaCodec.BufferInfo()
    var converter: PcmConverter? = null
    var inputDone = false
    var outputDone = false
    var idleRounds = 0
    while (!outputDone) {
      var progressed = false

      if (!inputDone) {
        val inputIndex = decoder.dequeueInputBuffer(0)
        if (inputIndex >= 0) {
          val inputBuffer = decoder.getInputBuffer(inputIndex) ?: throw DecodeFailedException()
          val size = extractor.readSampleData(inputBuffer, 0)
          if (size < 0) {
            decoder.queueInputBuffer(inputIndex, 0, 0, 0, MediaCodec.BUFFER_FLAG_END_OF_STREAM)
            inputDone = true
          } else {
            decoder.queueInputBuffer(inputIndex, 0, size, extractor.sampleTime, 0)
            extractor.advance()
          }
          progressed = true
        }
      }

      val outputIndex = decoder.dequeueOutputBuffer(info, OUTPUT_TIMEOUT_US)
      when {
        outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
          converter = PcmConverter.from(decoder.outputFormat, sink)
          progressed = true
        }
        outputIndex >= 0 -> {
          val outputBuffer = decoder.getOutputBuffer(outputIndex)
          if (outputBuffer != null && info.size > 0) {
            val active = converter ?: PcmConverter.from(trackFormat, sink).also { converter = it }
            outputBuffer.position(info.offset)
            outputBuffer.limit(info.offset + info.size)
            active.push(outputBuffer.order(ByteOrder.LITTLE_ENDIAN).asShortBuffer())
          }
          decoder.releaseOutputBuffer(outputIndex, false)
          if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) {
            outputDone = true
          }
          progressed = true
        }
      }

      idleRounds = if (progressed) 0 else idleRounds + 1
      if (idleRounds > MAX_IDLE_ROUNDS) {
        throw DecodeFailedException()
      }
    }
  } finally {
    codec?.let {
      runCatching { it.stop() }
      it.release()
    }
    extractor.release()
  }
}

/**
 * Averages the channels of decoded 16-bit PCM down to mono and resamples it to 16 kHz.
 *
 * ponytail: linear interpolation without an anti-aliasing filter. The recorder already captures
 * 16 kHz mono, so this is the identity on the real path; content above 8 kHz in a higher-rate
 * source would alias into the speech band. Upgrade path: a polyphase low-pass resampler.
 */
private class PcmConverter private constructor(
  private val channels: Int,
  inputRate: Int,
  private val sink: WavSink,
) {
  private val step = inputRate.toDouble() / TARGET_SAMPLE_RATE
  private var inputIndex = 0L
  private var outputIndex = 0L
  private var previous = 0

  fun push(samples: ShortBuffer) {
    val frames = samples.remaining() / channels
    // At most ceil(frames / step) outputs fall inside this buffer; two spare covers rounding.
    val out = ShortArray((frames / step).toInt() + 2)
    var written = 0
    repeat(frames) {
      var sum = 0
      repeat(channels) { sum += samples.get() }
      val current = sum / channels
      while (outputIndex * step <= inputIndex) {
        val fraction = outputIndex * step - (inputIndex - 1)
        out[written++] = (previous + (current - previous) * fraction).roundToInt().toShort()
        outputIndex++
      }
      previous = current
      inputIndex++
    }
    sink.append(out, written)
  }

  companion object {
    fun from(format: MediaFormat, sink: WavSink): PcmConverter {
      // PCM_ENCODING is absent when the decoder outputs the default, 16-bit PCM.
      if (format.containsKey(MediaFormat.KEY_PCM_ENCODING) &&
        format.getInteger(MediaFormat.KEY_PCM_ENCODING) != AudioFormat.ENCODING_PCM_16BIT
      ) {
        throw DecodeFailedException()
      }
      val channels = format.getInteger(MediaFormat.KEY_CHANNEL_COUNT)
      val rate = format.getInteger(MediaFormat.KEY_SAMPLE_RATE)
      if (channels < 1 || rate < 1) {
        throw DecodeFailedException()
      }
      return PcmConverter(channels, rate, sink)
    }
  }
}

/** Streams 16 kHz mono PCM16 into a WAV file, writing the header sizes once the length is known. */
private class WavSink(output: File) : AutoCloseable {
  private val file = RandomAccessFile(output, "rw")
  private var dataBytes = 0L

  val frames: Long
    get() = dataBytes / 2

  init {
    file.setLength(0)
    file.write(ByteArray(WAV_HEADER_BYTES))
  }

  fun append(samples: ShortArray, count: Int) {
    if (count == 0) {
      return
    }
    val bytes = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
    bytes.asShortBuffer().put(samples, 0, count)
    file.write(bytes.array(), 0, count * 2)
    dataBytes += count * 2L
  }

  fun finish() {
    val header = ByteBuffer.allocate(WAV_HEADER_BYTES).order(ByteOrder.LITTLE_ENDIAN)
    header.put("RIFF".toByteArray(Charsets.US_ASCII))
    header.putInt((36 + dataBytes).toInt())
    header.put("WAVE".toByteArray(Charsets.US_ASCII))
    header.put("fmt ".toByteArray(Charsets.US_ASCII))
    header.putInt(16)
    header.putShort(1) // PCM
    header.putShort(1) // mono
    header.putInt(TARGET_SAMPLE_RATE)
    header.putInt(TARGET_SAMPLE_RATE * 2) // bytes per second
    header.putShort(2) // bytes per frame
    header.putShort(16) // bits per sample
    header.put("data".toByteArray(Charsets.US_ASCII))
    header.putInt(dataBytes.toInt())
    file.seek(0)
    file.write(header.array())
  }

  override fun close() = file.close()
}
