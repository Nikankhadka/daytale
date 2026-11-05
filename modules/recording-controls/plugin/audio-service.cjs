const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const EXPO_AUDIO_VERSION = '57.0.5';
const SERVICE_PATH =
  'node_modules/expo-audio/android/src/main/java/expo/modules/audio/service/AudioRecordingService.kt';
const PATCH_PATH = 'modules/recording-controls/android/patch/AudioRecordingService.kt';
const HASH_PATH = 'modules/recording-controls/plugin/expected-audio-service.sha256';

/** SHA-256 of the pristine upstream service, as hex. */
function hashAudioServiceSource(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

/** Throws when the upstream service does not match the committed hash. */
function assertAudioServiceSource(source, expectedHash) {
  const actualHash = hashAudioServiceSource(source);
  if (actualHash !== expectedHash) {
    throw new Error(
      `expo-audio AudioRecordingService.kt hash mismatch: expected ${expectedHash}, got ${actualHash}`,
    );
  }
}

function readExpectedHash(projectRoot) {
  return fs.readFileSync(path.join(projectRoot, HASH_PATH), 'utf8').trim();
}

/**
 * Copies the checked-in patch over expo-audio's Android recording service. The version pin and
 * the hash guard make an expo-audio upgrade fail loudly instead of silently keeping an old patch.
 */
function copyPatchedService(projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'node_modules/expo-audio/package.json');
  const expoAudioPackage = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (expoAudioPackage.version !== EXPO_AUDIO_VERSION) {
    throw new Error(
      `expo-audio must be pinned to ${EXPO_AUDIO_VERSION}; found ${expoAudioPackage.version}`,
    );
  }

  const servicePath = path.join(projectRoot, SERVICE_PATH);
  const patch = fs.readFileSync(path.join(projectRoot, PATCH_PATH), 'utf8');
  const upstream = fs.readFileSync(servicePath, 'utf8');

  // Prebuild may run more than once against the same node_modules. The patch being present is
  // the only state we accept without a hash match; any other source must match the committed hash.
  if (upstream === patch) {
    return;
  }

  assertAudioServiceSource(upstream, readExpectedHash(projectRoot));
  fs.writeFileSync(servicePath, patch);
}

module.exports = {
  copyPatchedService,
  assertAudioServiceSource,
};
