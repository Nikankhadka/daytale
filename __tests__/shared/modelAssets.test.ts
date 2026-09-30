import { ensureModelAsset, ModelAssetError, type ModelAsset } from '../../src/shared/modelAssets';

type MockEntry = { size: number; md5: string | null };

const mockFiles = new Map<string, MockEntry>();
const mockDownload = jest.fn<Promise<MockEntry>, [string]>();

jest.mock('expo-file-system', () => {
  const join = (parts: unknown[]) =>
    parts
      .map((part) => (typeof part === 'string' ? part : (part as { uri: string }).uri))
      .map((part, index) =>
        index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, ''),
      )
      .join('/');

  class Directory {
    public uri: string;
    public constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    public create = jest.fn();
  }

  class File {
    public uri: string;
    public constructor(...parts: unknown[]) {
      this.uri = join(parts);
    }
    public get exists() {
      return mockFiles.has(this.uri);
    }
    public get size() {
      return mockFiles.get(this.uri)?.size ?? 0;
    }
    public get md5() {
      return mockFiles.get(this.uri)?.md5 ?? null;
    }
    public delete() {
      mockFiles.delete(this.uri);
    }
    public async move(destination: File) {
      mockFiles.set(destination.uri, mockFiles.get(this.uri) as MockEntry);
      mockFiles.delete(this.uri);
      this.uri = destination.uri;
    }
    public static async downloadFileAsync(url: string, destination: File) {
      mockFiles.set(destination.uri, await mockDownload(url));
      return new File(destination.uri);
    }
  }

  return { Directory, File, Paths: { document: { uri: 'file:///documents/' } } };
});

const asset: ModelAsset = {
  name: 'model.onnx',
  url: 'https://example.test/model.onnx',
  bytes: 10,
  md5: 'abcdef',
};
const target = 'file:///documents/models/model.onnx';
const partial = `${target}.download`;

describe('ensureModelAsset', () => {
  beforeEach(() => {
    mockFiles.clear();
    mockDownload.mockReset();
  });

  it('downloads a missing model, verifies it, and moves it into place', async () => {
    mockDownload.mockResolvedValue({ size: 10, md5: 'ABCDEF' });

    await expect(ensureModelAsset(asset)).resolves.toEqual({
      directory: '/documents/models',
      path: '/documents/models/model.onnx',
    });

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockDownload).toHaveBeenCalledWith(asset.url);
    expect([...mockFiles.keys()]).toEqual([target]);
  });

  it('skips the download when a valid model is already present', async () => {
    mockFiles.set(target, { size: 10, md5: 'abcdef' });

    await ensureModelAsset(asset);
    await ensureModelAsset(asset);

    expect(mockDownload).not.toHaveBeenCalled();
  });

  it('replaces a corrupt copy already in place', async () => {
    mockFiles.set(target, { size: 3, md5: 'ffffff' });
    mockDownload.mockResolvedValue({ size: 10, md5: 'abcdef' });

    await ensureModelAsset(asset);

    expect(mockDownload).toHaveBeenCalledTimes(1);
    expect(mockFiles.get(target)).toEqual({ size: 10, md5: 'abcdef' });
  });

  it.each([
    ['size', { size: 9, md5: 'abcdef' }],
    ['checksum', { size: 10, md5: '000000' }],
  ])('deletes the download and throws on %s mismatch, then recovers on retry', async (_, bad) => {
    mockDownload.mockResolvedValueOnce(bad);

    await expect(ensureModelAsset(asset)).rejects.toThrow(ModelAssetError);
    expect(mockFiles.has(partial)).toBe(false);
    expect(mockFiles.has(target)).toBe(false);

    mockDownload.mockResolvedValueOnce({ size: 10, md5: 'abcdef' });
    await expect(ensureModelAsset(asset)).resolves.toMatchObject({
      path: '/documents/models/model.onnx',
    });
    expect(mockFiles.has(target)).toBe(true);
  });

  it('reports a network failure clearly and leaves nothing behind', async () => {
    mockDownload.mockRejectedValueOnce(new Error('offline'));

    await expect(ensureModelAsset(asset)).rejects.toThrow('could not be downloaded');
    expect(mockFiles.size).toBe(0);
  });

  it('shares one download between concurrent callers', async () => {
    let finish: (entry: MockEntry) => void = () => undefined;
    mockDownload.mockReturnValue(new Promise<MockEntry>((resolve) => (finish = resolve)));

    const first = ensureModelAsset(asset);
    const second = ensureModelAsset(asset);
    await new Promise((resolve) => setTimeout(resolve, 0));
    finish({ size: 10, md5: 'abcdef' });

    const [a, b] = await Promise.all([first, second]);
    expect(a).toEqual(b);
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });
});
