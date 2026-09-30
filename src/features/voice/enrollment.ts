import type { VoiceProfileRepository } from '../../storage/repositories';
import type { UtcTimestamp, VoiceProfile } from '../../storage/types';

export const VOICE_SAMPLE_COUNT = 3;
export const VOICE_PROFILE_ID = '00000000-0000-4000-8000-000000000005';
export const VOICE_MATCH_THRESHOLD = 0.78;
export const VOICE_MODEL_VERSION = 'sherpa-onnx:3dspeaker_speech_campplus_sv_en_voxceleb_16k:1';

export type SpeakerEmbedding = number[];

export type SpeakerEmbeddingProvider = {
  readonly modelVersion: string;
  /** Optional warm-up (e.g. model download) so callers can show progress before recording. */
  prepare?: () => Promise<void>;
  embeddingFromFile: (filePath: string) => Promise<readonly number[]>;
};

export type VoiceEnrollmentSnapshot = {
  sampleCount: number;
  completed: boolean;
  slots: readonly boolean[];
};

export type SpeakerClassification = 'user' | 'other' | 'unknown';

export class VoiceEnrollmentError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'VoiceEnrollmentError';
  }
}

export function validateSpeakerEmbedding(value: unknown): SpeakerEmbedding {
  if (!Array.isArray(value) || value.length === 0) {
    throw new VoiceEnrollmentError('Speaker embedding is empty.');
  }
  if (value.some((item) => typeof item !== 'number' || !Number.isFinite(item))) {
    throw new VoiceEnrollmentError('Speaker embedding contains an invalid value.');
  }

  const embedding = [...value];
  if (embedding.every((item) => item === 0)) {
    throw new VoiceEnrollmentError('Speaker embedding has no signal.');
  }
  return embedding;
}

export function encodeEmbeddingEnvelope(
  embedding: readonly number[],
  modelVersion: string,
): string {
  const validated = validateSpeakerEmbedding(embedding);
  const payload = JSON.stringify({
    version: 1,
    modelVersion,
    dimension: validated.length,
    embedding: validated,
  });
  return `daytale-voice-v1.${base64Encode(payload)}`;
}

export function decodeEmbeddingEnvelope(blob: string): {
  embedding: SpeakerEmbedding;
  modelVersion: string;
} {
  if (!blob.startsWith('daytale-voice-v1.')) {
    throw new VoiceEnrollmentError('Speaker profile envelope version is unsupported.');
  }

  let payload: unknown;
  try {
    payload = JSON.parse(base64Decode(blob.slice('daytale-voice-v1.'.length)));
  } catch {
    throw new VoiceEnrollmentError('Speaker profile envelope is malformed.');
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    throw new VoiceEnrollmentError('Speaker profile envelope is malformed.');
  }
  const record = payload as Record<string, unknown>;
  if (record.version !== 1 || typeof record.modelVersion !== 'string') {
    throw new VoiceEnrollmentError('Speaker profile envelope is malformed.');
  }
  const embedding = validateSpeakerEmbedding(record.embedding);
  if (record.dimension !== embedding.length) {
    throw new VoiceEnrollmentError('Speaker profile embedding dimension is invalid.');
  }
  return { embedding, modelVersion: record.modelVersion };
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length === 0 || left.length !== right.length) {
    return Number.NaN;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index];
    const rightValue = right[index];
    if (!Number.isFinite(leftValue) || !Number.isFinite(rightValue)) {
      return Number.NaN;
    }
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return Number.NaN;
  }
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

export function classifySpeaker(
  profile: VoiceProfile,
  queryEmbedding: unknown,
  options: {
    userThreshold?: number;
    otherEmbeddings?: readonly (readonly number[])[];
    otherThreshold?: number;
  } = {},
): SpeakerClassification {
  if (profile.status !== 'ready' || profile.sampleCount !== VOICE_SAMPLE_COUNT) {
    return 'unknown';
  }

  let enrolled: SpeakerEmbedding;
  try {
    const decoded = decodeEmbeddingEnvelope(profile.encryptedEmbeddingBlob);
    if (decoded.modelVersion !== profile.modelVersion) {
      return 'unknown';
    }
    enrolled = decoded.embedding;
  } catch {
    return 'unknown';
  }

  let query: SpeakerEmbedding;
  try {
    query = validateSpeakerEmbedding(queryEmbedding);
  } catch {
    return 'unknown';
  }

  const userScore = cosineSimilarity(enrolled, query);
  const userThreshold = options.userThreshold ?? VOICE_MATCH_THRESHOLD;
  if (Number.isFinite(userScore) && userScore >= userThreshold) {
    return 'user';
  }

  const otherThreshold = options.otherThreshold ?? VOICE_MATCH_THRESHOLD;
  const otherScore = Math.max(
    ...(options.otherEmbeddings ?? []).map((embedding) => cosineSimilarity(embedding, query)),
    Number.NEGATIVE_INFINITY,
  );
  return Number.isFinite(otherScore) && otherScore >= otherThreshold ? 'other' : 'unknown';
}

export class VoiceEnrollmentController {
  private readonly samples: (SpeakerEmbedding | null)[] = Array.from(
    { length: VOICE_SAMPLE_COUNT },
    () => null,
  );

  private profile: VoiceProfile | null = null;

  public constructor(
    private readonly repository: VoiceProfileRepository,
    private readonly provider: SpeakerEmbeddingProvider,
    private readonly dependencies: {
      id?: string;
      now?: () => UtcTimestamp;
    } = {},
  ) {}

  public get snapshot(): VoiceEnrollmentSnapshot {
    const sampleCount = this.samples.filter((sample) => sample !== null).length;
    return {
      sampleCount,
      completed: this.profile !== null,
      slots: this.samples.map((sample) => sample !== null),
    };
  }

  public async captureSample(slot: number, filePath: string): Promise<VoiceProfile | null> {
    this.assertSlot(slot);
    if (this.samples[slot] !== null) {
      throw new VoiceEnrollmentError('Delete this sample before recording it again.');
    }

    const embedding = validateSpeakerEmbedding(await this.provider.embeddingFromFile(filePath));
    this.assertCompatibleDimension(embedding);
    this.samples[slot] = embedding;

    if (this.snapshot.sampleCount !== VOICE_SAMPLE_COUNT) {
      return null;
    }

    const now = this.dependencies.now?.() ?? new Date().toISOString();
    const profile: VoiceProfile = {
      id: this.dependencies.id ?? VOICE_PROFILE_ID,
      status: 'ready',
      sampleCount: VOICE_SAMPLE_COUNT,
      encryptedEmbeddingBlob: encodeEmbeddingEnvelope(
        averageEmbeddings(this.samples as SpeakerEmbedding[]),
        this.provider.modelVersion,
      ),
      modelVersion: this.provider.modelVersion,
      createdAt: now,
      updatedAt: now,
    };

    try {
      this.profile = await this.repository.save(profile);
      return this.profile;
    } catch (error) {
      this.samples[slot] = null;
      throw error;
    }
  }

  public async deleteSample(slot: number): Promise<void> {
    this.assertSlot(slot);
    if (this.profile !== null) {
      await this.repository.deleteById(this.profile.id);
      this.profile = null;
    }
    this.samples[slot] = null;
  }

  public async deleteProfile(): Promise<void> {
    if (this.profile !== null) {
      await this.repository.deleteById(this.profile.id);
    } else {
      await this.repository.deleteById(this.dependencies.id ?? VOICE_PROFILE_ID);
    }
    this.profile = null;
    this.samples.fill(null);
  }

  private assertSlot(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot >= VOICE_SAMPLE_COUNT) {
      throw new VoiceEnrollmentError('Voice sample slot is invalid.');
    }
  }

  private assertCompatibleDimension(embedding: SpeakerEmbedding): void {
    const existing = this.samples.find((sample) => sample !== null);
    if (existing !== undefined && existing.length !== embedding.length) {
      throw new VoiceEnrollmentError('Voice samples use incompatible model dimensions.');
    }
  }
}

function averageEmbeddings(samples: readonly SpeakerEmbedding[]): SpeakerEmbedding {
  if (samples.length !== VOICE_SAMPLE_COUNT || samples.some((sample) => sample.length === 0)) {
    throw new VoiceEnrollmentError('Three valid voice samples are required.');
  }
  const dimension = samples[0].length;
  if (samples.some((sample) => sample.length !== dimension)) {
    throw new VoiceEnrollmentError('Voice samples use incompatible model dimensions.');
  }
  return validateSpeakerEmbedding(
    Array.from(
      { length: dimension },
      (_, index) => samples.reduce((sum, sample) => sum + sample[index], 0) / samples.length,
    ),
  );
}

function base64Encode(value: string): string {
  if (typeof globalThis.btoa !== 'function') {
    throw new VoiceEnrollmentError('Voice profile encoding is unavailable on this platform.');
  }
  const bytes = encodeURIComponent(value).replace(/%([0-9A-F]{2})/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return globalThis.btoa(bytes);
}

function base64Decode(value: string): string {
  if (typeof globalThis.atob !== 'function') {
    throw new VoiceEnrollmentError('Voice profile decoding is unavailable on this platform.');
  }
  const bytes = globalThis.atob(value);
  const encoded = Array.from(
    bytes,
    (byte) => `%${byte.charCodeAt(0).toString(16).padStart(2, '0')}`,
  ).join('');
  return decodeURIComponent(encoded);
}
