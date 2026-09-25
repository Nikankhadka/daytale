module.exports = {
  preset: 'jest-expo',
  clearMocks: true,
  moduleNameMapper: {
    '^react-native-reanimated$': '<rootDir>/__tests__/reanimatedMock.ts',
  },
  testMatch: ['<rootDir>/__tests__/**/*.test.[jt]s?(x)'],
};
