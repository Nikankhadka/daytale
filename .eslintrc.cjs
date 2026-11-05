module.exports = {
  extends: ['expo'],
  ignorePatterns: ['node_modules/', '.expo/', 'coverage/', 'dist/'],
  overrides: [
    {
      files: ['modules/recording-controls/plugin/**/*.{js,cjs,mjs}'],
      parser: 'espree',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'script',
      },
      env: {
        node: true,
      },
    },
  ],
};
