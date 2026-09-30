package expo.modules.audiodecoder

import expo.modules.kotlin.exception.CodedException

/**
 * The input holds no decodable audio: it is not audio at all, or it decodes to zero frames.
 * Retrying can never help, so callers may discard the recording.
 */
internal class InvalidAudioException(cause: Throwable? = null) :
  CodedException("ERR_INVALID_AUDIO", "The file holds no decodable audio.", cause)

/** Anything else that went wrong while converting. The input may well be fine, so callers retry. */
internal class DecodeFailedException(cause: Throwable? = null) :
  CodedException("ERR_DECODE_FAILED", "The audio could not be converted to WAV.", cause)
