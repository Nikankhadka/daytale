export type AppCheckTokenProvider = () => Promise<string>;

export type AppCheckTokenProviderOptions = {
  /** Defaults to the Expo `__DEV__` flag. */
  dev?: boolean;
  /** Defaults to `EXPO_PUBLIC_APPCHECK_DEV_TOKEN`. */
  token?: string;
};

/**
 * Dev-only App Check token port. Production token acquisition is not wired yet, so a production
 * build fails closed instead of sending an unauthenticated request. The token never leaves this
 * function through a log.
 */
export function createAppCheckTokenProvider(
  options: AppCheckTokenProviderOptions = {},
): AppCheckTokenProvider {
  // Literal member access so Expo inlines the value at build time.
  const token = options.token ?? process.env.EXPO_PUBLIC_APPCHECK_DEV_TOKEN;
  const dev = options.dev ?? __DEV__;

  return async () => {
    if (!dev || token === undefined || token.trim() === '') {
      throw new Error('app-check-unconfigured');
    }
    return token;
  };
}
