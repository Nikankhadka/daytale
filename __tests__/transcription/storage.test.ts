import { writeSuccessReceipt } from '../../src/storage/cleanup';
import { StorageValidationError } from '../../src/storage/types';
import {
  audioFor,
  chunkAudio,
  chunkId,
  chunkState,
  countRows,
  createStorageFixture,
  makeSegment,
  SESSION_ID,
} from './kit';
import { uuidSequence } from '../recording/testKit';

const COMPLETED_AT = '2026-03-10T09:30:00.000Z';

function receiptDeps() {
  return {
    hash: async () => 'a'.repeat(64),
    uuid: uuidSequence(),
    now: () => COMPLETED_AT,
  };
}

describe('saveChunkTranscript', () => {
  it('stores every segment and clears the audio in one step', async () => {
    const { database, repositories } = await createStorageFixture();
    const segments = [makeSegment(0, 0), makeSegment(0, 1, { language: 'ne', text: 'नमस्ते' })];

    await expect(repositories.saveChunkTranscript({ chunkId: chunkId(0), segments })).resolves.toBe(
      true,
    );

    expect(chunkState(database, 0)).toBe('transcribed');
    expect(await chunkAudio(database, 0)).toBeNull();
    const stored = await repositories.transcriptSegments.list();
    expect(stored).toHaveLength(2);
    expect(stored.map((segment) => segment.text).sort()).toEqual(['segment 0', 'नमस्ते'].sort());
  });

  it('marks a silent chunk transcribed with no segments', async () => {
    const { database, repositories } = await createStorageFixture();

    await expect(
      repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [] }),
    ).resolves.toBe(true);

    expect(chunkState(database, 0)).toBe('transcribed');
    expect(await chunkAudio(database, 0)).toBeNull();
    expect(countRows(database, 'transcript_segments')).toBe(0);
  });

  it('inserts nothing when the chunk is no longer closed', async () => {
    const { database, repositories } = await createStorageFixture();
    await repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [makeSegment(0, 0)] });

    await expect(
      repositories.saveChunkTranscript({
        chunkId: chunkId(0),
        segments: [makeSegment(0, 1), makeSegment(0, 2)],
      }),
    ).resolves.toBe(false);

    expect(countRows(database, 'transcript_segments')).toBe(1);
  });

  it('reports a missing chunk as not applied', async () => {
    const { database, repositories } = await createStorageFixture();

    await expect(
      repositories.saveChunkTranscript({ chunkId: chunkId(9), segments: [] }),
    ).resolves.toBe(false);
    expect(countRows(database, 'transcript_segments')).toBe(0);
  });

  it('rolls back the segments and keeps the audio when one insert fails', async () => {
    const { database, repositories } = await createStorageFixture();
    const real = database.runAsync;
    let inserts = 0;
    database.runAsync = async (source, ...params) => {
      if (source.includes('INSERT INTO transcript_segments')) {
        inserts += 1;
        if (inserts === 2) {
          throw new Error('induced segment insert failure');
        }
      }
      return real(source, ...params);
    };

    await expect(
      repositories.saveChunkTranscript({
        chunkId: chunkId(0),
        segments: [makeSegment(0, 0), makeSegment(0, 1)],
      }),
    ).rejects.toThrow('induced segment insert failure');

    expect(chunkState(database, 0)).toBe('closed');
    expect(await chunkAudio(database, 0)).toEqual(audioFor(0));
    expect(countRows(database, 'transcript_segments')).toBe(0);
  });

  it('rejects a segment that belongs to another chunk or an invalid segment before writing', async () => {
    const { database, repositories } = await createStorageFixture(2);

    await expect(
      repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [makeSegment(1, 0)] }),
    ).rejects.toThrow();
    await expect(
      repositories.saveChunkTranscript({
        chunkId: chunkId(0),
        segments: [makeSegment(0, 0, { transcriptConfidence: 1.5 })],
      }),
    ).rejects.toBeInstanceOf(StorageValidationError);

    expect(chunkState(database, 0)).toBe('closed');
    expect(countRows(database, 'transcript_segments')).toBe(0);
  });
});

describe('discardClosedChunk', () => {
  it('deletes the audio and marks the chunk deleted without segments', async () => {
    const { database, repositories } = await createStorageFixture();

    await expect(repositories.discardClosedChunk(chunkId(0))).resolves.toBe(true);

    expect(chunkState(database, 0)).toBe('deleted');
    expect(await chunkAudio(database, 0)).toBeNull();
    expect(countRows(database, 'transcript_segments')).toBe(0);
  });

  it('never overwrites a chunk that was already transcribed', async () => {
    const { database, repositories } = await createStorageFixture();
    await repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [] });

    await expect(repositories.discardClosedChunk(chunkId(0))).resolves.toBe(false);

    expect(chunkState(database, 0)).toBe('transcribed');
  });
});

describe('writeSuccessReceipt', () => {
  it('writes one content-free receipt once every chunk is settled', async () => {
    const { database, repositories } = await createStorageFixture(2);
    await repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [makeSegment(0, 0)] });
    await repositories.discardClosedChunk(chunkId(1));

    const receipt = await writeSuccessReceipt(database, SESSION_ID, receiptDeps());

    expect(receipt).toMatchObject({
      sessionId: SESSION_ID,
      reason: 'success',
      deletedKinds: ['audio_chunks'],
      completedAt: COMPLETED_AT,
      contentFreeHash: 'a'.repeat(64),
    });
    expect(await repositories.cleanupReceipts.list()).toHaveLength(1);
    expect(JSON.stringify(receipt)).not.toContain('segment 0');
  });

  it('writes nothing while a closed chunk is still waiting', async () => {
    const { database, repositories } = await createStorageFixture(2);
    await repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [] });

    await expect(writeSuccessReceipt(database, SESSION_ID, receiptDeps())).resolves.toBeNull();
    expect(countRows(database, 'cleanup_receipts')).toBe(0);
  });

  it('writes nothing for a session that never had audio to settle', async () => {
    const { database } = await createStorageFixture(0);

    await expect(writeSuccessReceipt(database, SESSION_ID, receiptDeps())).resolves.toBeNull();
    expect(countRows(database, 'cleanup_receipts')).toBe(0);
  });

  it('does not write a second success receipt for the same session', async () => {
    const { database, repositories } = await createStorageFixture();
    await repositories.saveChunkTranscript({ chunkId: chunkId(0), segments: [] });

    await writeSuccessReceipt(database, SESSION_ID, receiptDeps());
    await expect(writeSuccessReceipt(database, SESSION_ID, receiptDeps())).resolves.toBeNull();

    expect(countRows(database, 'cleanup_receipts')).toBe(1);
  });

  it('rejects an invalid session id', async () => {
    const { database } = await createStorageFixture();

    await expect(writeSuccessReceipt(database, 'nope', receiptDeps())).rejects.toBeInstanceOf(
      StorageValidationError,
    );
  });
});
