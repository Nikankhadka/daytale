package expo.modules.audiodecoder

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class AudioDecoderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("AudioDecoder")

    AsyncFunction("decodeToWav") { inputPath: String, outputPath: String ->
      mapOf("durationMs" to transcodeToWav(inputPath, outputPath))
    }
  }
}
