import ExpoModulesCore

public class AudioDecoderModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AudioDecoder")

    // Paths are plain filesystem paths (no file:// scheme). Resolves with the decoded duration.
    AsyncFunction("decodeToWav") { (inputPath: String, outputPath: String) throws -> [String: Int] in
      let durationMs = try transcodeToWav(inputPath: inputPath, outputPath: outputPath)
      return ["durationMs": durationMs]
    }
  }
}
