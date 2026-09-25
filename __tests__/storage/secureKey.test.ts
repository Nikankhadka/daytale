import {
  DATABASE_KEY_NAME,
  DATABASE_KEY_OPTIONS,
  getDatabaseKey,
  SecureDatabaseKeyError,
  type SecureKeyDependencies,
} from '../../src/storage/secureKey';

function createDependencies(storedKey: string | null = null): SecureKeyDependencies & {
  storedKey: { value: string | null };
} {
  const state = { value: storedKey };
  return {
    storedKey: state,
    secureStore: {
      getItemAsync: jest.fn(async () => state.value),
      setItemAsync: jest.fn(async (_key: string, value: string) => {
        state.value = value;
      }),
      deleteItemAsync: jest.fn(async () => {
        state.value = null;
      }),
    },
    crypto: {
      getRandomBytesAsync: jest.fn(async () => new Uint8Array(32).fill(0xab)),
    },
  };
}

describe('secure database key', () => {
  it('creates one random key and reuses the SecureStore value', async () => {
    const dependencies = createDependencies();

    const firstKey = await getDatabaseKey(dependencies);
    const secondKey = await getDatabaseKey(dependencies);

    expect(firstKey).toHaveLength(64);
    expect(secondKey).toBe(firstKey);
    expect(dependencies.crypto.getRandomBytesAsync).toHaveBeenCalledTimes(1);
    expect(dependencies.secureStore.setItemAsync).toHaveBeenCalledTimes(1);
    expect(dependencies.secureStore.setItemAsync).toHaveBeenCalledWith(
      DATABASE_KEY_NAME,
      firstKey,
      DATABASE_KEY_OPTIONS,
    );
  });

  it('returns an existing key without generating or rewriting it', async () => {
    const dependencies = createDependencies('stored-key');

    await expect(getDatabaseKey(dependencies)).resolves.toBe('stored-key');

    expect(dependencies.crypto.getRandomBytesAsync).not.toHaveBeenCalled();
    expect(dependencies.secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('fails closed when SecureStore cannot be read', async () => {
    const dependencies = createDependencies();
    (dependencies.secureStore.getItemAsync as jest.Mock).mockRejectedValue(
      new Error('unavailable'),
    );

    await expect(getDatabaseKey(dependencies)).rejects.toBeInstanceOf(SecureDatabaseKeyError);
    expect(dependencies.crypto.getRandomBytesAsync).not.toHaveBeenCalled();
    expect(dependencies.secureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('fails closed when random key generation cannot complete', async () => {
    const dependencies = createDependencies();
    (dependencies.crypto.getRandomBytesAsync as jest.Mock).mockRejectedValue(
      new Error('unavailable'),
    );

    await expect(getDatabaseKey(dependencies)).rejects.toBeInstanceOf(SecureDatabaseKeyError);
    expect(dependencies.secureStore.setItemAsync).not.toHaveBeenCalled();
  });
});
