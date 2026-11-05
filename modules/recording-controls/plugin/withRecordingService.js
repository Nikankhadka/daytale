const { withDangerousMod } = require('@expo/config-plugins');

const { copyPatchedService } = require('./audio-service.cjs');

module.exports = function withRecordingService(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      copyPatchedService(config.modRequest.projectRoot);
      return config;
    },
  ]);
};
