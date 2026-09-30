import AVFoundation

private let targetSampleRate: Double = 16_000
private let readFrameCount: AVAudioFrameCount = 8_192

/// Decodes any audio file AVFoundation can read (the recorder writes AAC in M4A) into a 16 kHz
/// mono 16-bit PCM WAV, which is the only input whisper.cpp accepts. Streams in small buffers so
/// memory stays flat for any chunk length. Returns the duration of the written audio in
/// milliseconds. Throws InvalidAudioException for a file that cannot be opened as audio or that
/// decodes to no frames, and DecodeFailedException for every other failure. No partial output is
/// left behind on failure.
func transcodeToWav(inputPath: String, outputPath: String) throws -> Int {
  let outputURL = URL(fileURLWithPath: outputPath)
  var succeeded = false
  defer {
    if !succeeded {
      try? FileManager.default.removeItem(at: outputURL)
    }
  }

  // AVAudioFile picks the container from the extension, so anything but .wav would not be WAV.
  guard outputURL.pathExtension.lowercased() == "wav",
    FileManager.default.fileExists(atPath: inputPath)
  else {
    throw DecodeFailedException()
  }

  let inputFile: AVAudioFile
  do {
    inputFile = try AVAudioFile(forReading: URL(fileURLWithPath: inputPath))
  } catch {
    throw InvalidAudioException()
  }
  let inputFormat = inputFile.processingFormat
  guard inputFile.length > 0, inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
    throw InvalidAudioException()
  }

  guard
    let outputFormat = AVAudioFormat(
      commonFormat: .pcmFormatInt16, sampleRate: targetSampleRate, channels: 1, interleaved: true),
    let converter = AVAudioConverter(from: inputFormat, to: outputFormat),
    let inputBuffer = AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: readFrameCount)
  else {
    throw DecodeFailedException()
  }
  // The converter mixes several channels down to the single output channel on its own.
  converter.sampleRateConverterQuality = AVAudioQuality.max.rawValue

  // Room for a full input buffer after resampling, plus the converter's own look-ahead.
  let outputCapacity =
    AVAudioFrameCount((Double(readFrameCount) * targetSampleRate / inputFormat.sampleRate).rounded(.up))
    + 4_096
  guard let outputBuffer = AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: outputCapacity)
  else {
    throw DecodeFailedException()
  }

  var outputFile: AVAudioFile? = nil
  var framesWritten: Int64 = 0
  var inputEnded = false
  var readFailure: Error? = nil

  do {
    outputFile = try AVAudioFile(
      forWriting: outputURL,
      settings: [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVSampleRateKey: targetSampleRate,
        AVNumberOfChannelsKey: 1,
        AVLinearPCMBitDepthKey: 16,
        AVLinearPCMIsFloatKey: false,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false,
      ],
      commonFormat: .pcmFormatInt16,
      interleaved: true)

    conversion: while true {
      var conversionError: NSError?
      let status = converter.convert(to: outputBuffer, error: &conversionError) { _, inputStatus in
        // Reading at the end of the file throws instead of returning no frames, so stop before it.
        if inputEnded || inputFile.framePosition >= inputFile.length {
          inputEnded = true
          inputStatus.pointee = .endOfStream
          return nil
        }
        do {
          try inputFile.read(into: inputBuffer, frameCount: readFrameCount)
        } catch {
          readFailure = error
          inputEnded = true
          inputStatus.pointee = .endOfStream
          return nil
        }
        if inputBuffer.frameLength == 0 {
          inputEnded = true
          inputStatus.pointee = .endOfStream
          return nil
        }
        inputStatus.pointee = .haveData
        return inputBuffer
      }

      if outputBuffer.frameLength > 0 {
        try outputFile?.write(from: outputBuffer)
        framesWritten += Int64(outputBuffer.frameLength)
      }
      switch status {
      case .haveData:
        continue conversion
      case .endOfStream, .inputRanDry:
        break conversion
      case .error:
        throw conversionError ?? DecodeFailedException()
      @unknown default:
        throw DecodeFailedException()
      }
    }
  } catch let failure as InvalidAudioException {
    throw failure
  } catch {
    let failure = DecodeFailedException()
    failure.cause = error
    throw failure
  }

  // The WAV header is only finalized when the file is released.
  outputFile = nil

  if let readFailure {
    let failure = DecodeFailedException()
    failure.cause = readFailure
    throw failure
  }
  guard framesWritten > 0 else {
    throw InvalidAudioException()
  }
  succeeded = true
  return Int((Double(framesWritten) * 1_000 / targetSampleRate).rounded())
}
