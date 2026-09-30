// whisper.rn 0.7.4 has no "." entry in its exports map, so it is imported as 'whisper.rn/index',
// which resolves to its TypeScript source. That source reads the React Native global `global`,
// which the app's type list (jest only) does not declare.
// ponytail: delete this file once a whisper.rn release ships self-contained types at a resolvable
// entry and the engine can import plain 'whisper.rn'.
// A redeclarable var, not const: it must not clash if @types/node ever declares `global` too.
// eslint-disable-next-line no-var
declare var global: typeof globalThis;
