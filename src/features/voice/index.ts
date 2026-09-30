export { VoiceProfileCard } from './VoiceProfileCard';
export { VoiceSetupScreen } from './VoiceSetupScreen';
export type { VoiceSampleRecorder, VoiceSetupScreenProps } from './VoiceSetupScreen';
export {
  classifySpeaker,
  cosineSimilarity,
  decodeEmbeddingEnvelope,
  encodeEmbeddingEnvelope,
  VOICE_MATCH_THRESHOLD,
  VOICE_MODEL_VERSION,
  VOICE_PROFILE_ID,
  VOICE_SAMPLE_COUNT,
  VoiceEnrollmentController,
  VoiceEnrollmentError,
  validateSpeakerEmbedding,
} from './enrollment';
export type {
  SpeakerClassification,
  SpeakerEmbedding,
  SpeakerEmbeddingProvider,
  VoiceEnrollmentSnapshot,
} from './enrollment';
export {
  createDefaultSpeakerEmbeddingProvider,
  createSherpaSpeakerEmbeddingProvider,
  unavailableSpeakerEmbeddingProvider,
} from './speaker';
