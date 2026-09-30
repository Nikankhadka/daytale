import { Directory, File, Paths } from 'expo-file-system';

export type ModelAsset = {
  /** File name inside the models directory. */
  name: string;
  url: string;
  bytes: number;
  md5: string;
};

export type ModelAssetLocation = {
  /** Plain filesystem paths (no file:// scheme), which is what the sherpa-onnx native side expects. */
  directory: string;
  path: string;
};

export class ModelAssetError extends Error {
  public constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ModelAssetError';
  }
}

const MODEL_DIRECTORY = 'models';
const inFlight = new Map<string, Promise<ModelAssetLocation>>();

/**
 * Makes sure `asset` exists in documentDirectory/models, downloading it on first use.
 * Concurrent callers for the same asset share one download.
 */
export function ensureModelAsset(asset: ModelAsset): Promise<ModelAssetLocation> {
  let pending = inFlight.get(asset.name);
  if (pending === undefined) {
    pending = provision(asset).finally(() => inFlight.delete(asset.name));
    inFlight.set(asset.name, pending);
  }
  return pending;
}

async function provision(asset: ModelAsset): Promise<ModelAssetLocation> {
  const directory = new Directory(Paths.document, MODEL_DIRECTORY);
  const target = new File(directory, asset.name);
  const location = { directory: toPlainPath(directory.uri), path: toPlainPath(target.uri) };

  if (target.exists && isValid(target, asset)) {
    return location;
  }

  const discard = (name: string) => {
    const file = new File(directory, name);
    if (file.exists) {
      file.delete();
    }
  };
  const partialName = `${asset.name}.download`;
  discard(asset.name);
  directory.create({ intermediates: true, idempotent: true });
  discard(partialName);

  try {
    const partial = await File.downloadFileAsync(asset.url, new File(directory, partialName), {
      idempotent: true,
    }).catch((cause: unknown) => {
      throw new ModelAssetError(
        `The ${asset.name} voice model could not be downloaded. Check your connection and try again.`,
        { cause },
      );
    });
    if (!isValid(partial, asset)) {
      throw new ModelAssetError(
        `The downloaded ${asset.name} voice model failed verification. Try again.`,
      );
    }
    await partial.move(target, { overwrite: true });
  } catch (error) {
    discard(partialName);
    throw error;
  }
  return location;
}

// ponytail: expo-file-system only exposes md5 (no sha256), so the device checks size + md5 as an
// integrity check against corruption; upgrade to sha256 if a native hashing API becomes available.
function isValid(file: { size: number; md5: string | null }, asset: ModelAsset): boolean {
  return file.size === asset.bytes && file.md5?.toLowerCase() === asset.md5;
}

function toPlainPath(uri: string): string {
  return decodeURI(uri.replace(/^file:\/\//, '')).replace(/\/+$/, '');
}
