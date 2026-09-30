import ExpoModulesCore

/// The input holds no decodable audio: it is not audio at all, or it decodes to zero frames.
/// Retrying can never help, so callers may discard the recording.
internal final class InvalidAudioException: Exception {
  override var code: String { "ERR_INVALID_AUDIO" }
  override var reason: String { "The file holds no decodable audio." }
}

/// Anything else that went wrong while converting. The input may well be fine, so callers retry.
internal final class DecodeFailedException: Exception {
  override var code: String { "ERR_DECODE_FAILED" }
  override var reason: String { "The audio could not be converted to WAV." }
}
