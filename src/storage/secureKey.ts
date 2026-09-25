import {
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  deleteItemAsync,
  getItemAsync,
  setItemAsync,
} from 'expo-secure-store';
import type { SecureStoreOptions } from 'expo-secure-store';
import { getRandomBytesAsync } from 'expo-crypto';

export const DATABASE_KEY_NAME = 'daytale.sqlcipher.key';

export const DATABASE_KEY_OPTIONS: SecureStoreOptions = {
  keychainAccessible: AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

export type SecureStoreOperations = {
  getItemAsync: (key: string, options?: SecureStoreOptions) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: SecureStoreOptions) => Promise<void>;
  deleteItemAsync: (key: string, options?: SecureStoreOptions) => Promise<void>;
};

export type RandomBytesOperations = {
  getRandomBytesAsync: (byteCount: number) => Promise<Uint8Array>;
};

export type SecureKeyDependencies = {
  secureStore: SecureStoreOperations;
  crypto: RandomBytesOperations;
};

export class SecureDatabaseKeyError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'SecureDatabaseKeyError';
  }
}

const nativeDependencies: SecureKeyDependencies = {
  secureStore: { getItemAsync, setItemAsync, deleteItemAsync },
  crypto: { getRandomBytesAsync },
};

let keyOperation = Promise.resolve();

export function getDatabaseKey(
  dependencies: SecureKeyDependencies = nativeDependencies,
): Promise<string> {
  const next = keyOperation.then(() => loadOrCreateKey(dependencies));
  keyOperation = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

export async function deleteDatabaseKey(
  dependencies: SecureKeyDependencies = nativeDependencies,
): Promise<void> {
  try {
    await dependencies.secureStore.deleteItemAsync(DATABASE_KEY_NAME, DATABASE_KEY_OPTIONS);
  } catch {
    throw new SecureDatabaseKeyError('SecureStore key deletion failed.');
  }
}

async function loadOrCreateKey(dependencies: SecureKeyDependencies): Promise<string> {
  let storedKey: string | null;
  try {
    storedKey = await dependencies.secureStore.getItemAsync(
      DATABASE_KEY_NAME,
      DATABASE_KEY_OPTIONS,
    );
  } catch {
    throw new SecureDatabaseKeyError('SecureStore key access failed.');
  }

  if (storedKey !== null) {
    if (storedKey.length === 0) {
      throw new SecureDatabaseKeyError('SecureStore returned an unusable database key.');
    }
    return storedKey;
  }

  let randomBytes: Uint8Array;
  try {
    randomBytes = await dependencies.crypto.getRandomBytesAsync(32);
  } catch {
    throw new SecureDatabaseKeyError('Database key generation failed.');
  }

  if (randomBytes.length !== 32) {
    throw new SecureDatabaseKeyError('Database key generation returned invalid bytes.');
  }

  const newKey = bytesToHex(randomBytes);
  try {
    await dependencies.secureStore.setItemAsync(DATABASE_KEY_NAME, newKey, DATABASE_KEY_OPTIONS);
  } catch {
    throw new SecureDatabaseKeyError('SecureStore key write failed.');
  }
  return newKey;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
