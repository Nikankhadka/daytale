import { randomUUID } from 'expo-crypto';
import * as FileSystem from 'expo-file-system';

import { decodeToWav } from '../../modules/audio-decoder';

import {
  createDefaultTranscriptionDeps,
  createScratchFiles,
} from '../../src/features/transcription/defaults';
import { expoRecordingFiles } from '../../src/features/recording/files';
import type { StorageBootstrapResult } from '../../src/storage/bootstrap';

type FakeFileSystem = typeof FileSystem & {
  __files: Map<string, Uint8Array>;
  __directories: Set<string>;
};

jest.mock('expo-file-system', () => {
  const files = new Map<string, Uint8Array>();
  const directories = new Set<string>();
  const join = (parts: readonly (string | { uri: string })[], trailingSlash: boolean) => {
    const [base, ...names] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    const joined = [base.replace(/\/+$/, ''), ...names].join('/');
    return trailingSlash ? `${joined}/` : joined;
  };

  class Directory {
    public readonly uri: string;
    public constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts, true);
    }
    public get exists() {
      return directories.has(this.uri);
    }
    public create() {
      directories.add(this.uri);
    }
    public delete() {
      directories.delete(this.uri);
      for (const key of [...files.keys()]) {
        if (key.startsWith(this.uri)) {
          files.delete(key);
        }
      }
    }
  }

  class File {
    public readonly uri: string;
    public constructor(...parts: (string | { uri: string })[]) {
      this.uri = join(parts, false);
    }
    public get exists() {
      return files.has(this.uri);
    }
    public create() {
      files.set(this.uri, new Uint8Array());
    }
    public write(bytes: Uint8Array) {
      files.set(this.uri, bytes);
    }
    public delete() {
      if (!files.delete(this.uri)) {
        throw new Error('missing file');
      }
    }
  }

  return {
    Directory,
    File,
    Paths: { cache: { uri: 'file:///var/My%20App/cache/' } },
    __files: files,
    __directories: directories,
  };
});

const fake = FileSystem as FakeFileSystem;
const SCRATCH = 'file:///var/My%20App/cache/transcription/';

beforeEach(() => {
  fake.__files.clear();
  fake.__directories.clear();
});

describe('createScratchFiles', () => {
  it('hands out plain, decoded filesystem paths inside the cache directory', () => {
    const files = createScratchFiles();

    expect(files.pathFor('a.wav')).toBe('/var/My App/cache/transcription/a.wav');
  });

  it('writes bytes under the scratch directory and removes them again', async () => {
    const files = createScratchFiles();
    await files.reset();

    await files.write('a.m4a', new Uint8Array([1, 2, 3]));

    expect(fake.__files.get(`${SCRATCH}a.m4a`)).toEqual(new Uint8Array([1, 2, 3]));
    await files.remove('a.m4a');
    expect(fake.__files.size).toBe(0);
  });

  it('overwrites a file that already exists', async () => {
    const files = createScratchFiles();
    await files.reset();
    await files.write('a.m4a', new Uint8Array([1]));

    await files.write('a.m4a', new Uint8Array([9, 9]));

    expect(fake.__files.get(`${SCRATCH}a.m4a`)).toEqual(new Uint8Array([9, 9]));
  });

  it('treats removing a file that is already gone as success', async () => {
    const files = createScratchFiles();
    await files.reset();

    await expect(files.remove('missing.wav')).resolves.toBeUndefined();
  });

  it('creates a missing scratch directory on reset', async () => {
    await createScratchFiles().reset();

    expect(fake.__directories.has(SCRATCH)).toBe(true);
  });

  it('empties leftovers of a crashed run on reset', async () => {
    const files = createScratchFiles();
    await files.reset();
    await files.write('stale.m4a', new Uint8Array([1]));
    await files.write('stale.wav', new Uint8Array([2]));

    await files.reset();

    expect(fake.__files.size).toBe(0);
    expect(fake.__directories.has(SCRATCH)).toBe(true);
  });
});

describe('createDefaultTranscriptionDeps', () => {
  it('wires every dependency without loading any native model', () => {
    const storage = {} as StorageBootstrapResult;

    const deps = createDefaultTranscriptionDeps(storage);

    expect(deps.storage).toBe(storage);
    expect(typeof deps.engine.transcribe).toBe('function');
    expect(typeof deps.engine.detectSpeech).toBe('function');
    expect(typeof deps.engine.release).toBe('function');
    expect(deps.decode).toBe(decodeToWav);
    expect(deps.sha256).toBe(expoRecordingFiles.sha256);
    expect(deps.uuid).toBe(randomUUID);
    expect(typeof deps.files.reset).toBe('function');
    expect(typeof deps.speaker?.embeddingFromWindow).toBe('function');
    const now = deps.now();
    expect(new Date(now).toISOString()).toBe(now);
  });
});
