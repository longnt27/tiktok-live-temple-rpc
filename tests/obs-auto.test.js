'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createObsAutomation } = require('../obs-auto');

const landscape = {
  width: 1920, height: 1080, outputWidth: 1920, outputHeight: 1080, fps: 60
};
const portrait = {
  width: 1080, height: 1920, outputWidth: 1080, outputHeight: 1920, fps: 30
};

function fakeObs() {
  const state = {
    connected: true,
    sceneReady: false,
    canvas: { ...landscape },
    streaming: false, recording: false,
    error: null
  };
  const calls = { setup: 0, connect: 0, save: [], startStream: 0 };
  const bridge = {
    async getStatus() { return { ...state, canvas: { ...state.canvas } }; },
    async setupScene(port) {
      assert.equal(port, 3000);
      calls.setup++;
      state.sceneReady = true;
      state.canvas = { ...portrait };
      return { ok: true };
    },
    async connectObs(password) {
      calls.connect++;
      if (password !== 'my-valid-password') throw new Error('Authentication failed');
      return { close() {} };
    },
    savePassword(password) { calls.save.push(password); }
  };
  return { state, calls, bridge };
}

test('one click pairs OBS and creates a 9:16 scene without a separate setup action', async () => {
  const { bridge, calls, state } = fakeObs();
  const auto = createObsAutomation(bridge, 3000);
  await assert.rejects(() => auto.pair('wrong-password'), /Authentication failed/);
  assert.deepEqual(calls.save, [], 'do not persist invalid passwords');
  const result = await auto.pair('my-valid-password');
  assert.deepEqual(calls.save, ['my-valid-password']);
  assert.equal(result.automation.ready, true);
  assert.equal(state.canvas.height, 1920);
  assert.equal(calls.setup, 1);
  await auto.reconcile();
  await auto.reconcile();
  assert.equal(calls.setup, 1, 'periodic checks must not create duplicate scenes');
  assert.equal(calls.startStream, 0, 'automatic OBS setup must never begin a broadcast');
});

test('OBS session reconnect restores missing stage automatically', async () => {
  const { bridge, calls, state } = fakeObs();
  const auto = createObsAutomation(bridge, 3000);
  await auto.reconcile();
  assert.equal(calls.setup, 1);
  state.connected = false;
  state.error = 'OBS is closed';
  assert.equal((await auto.reconcile()).automation.phase, 'waiting');
  state.connected = true;
  state.error = null;
  state.sceneReady = false;
  state.canvas = { ...landscape };
  const result = await auto.reconcile();
  assert.equal(result.automation.ready, true);
  assert.equal(calls.setup, 2, 'restart must recreate the stage only when missing');
});

test('auto setup defers any OBS scene changes while streaming or recording', async () => {
  const { bridge, state, calls } = fakeObs();
  const auto = createObsAutomation(bridge, 3000);
  state.streaming = true;
  assert.equal((await auto.reconcile()).automation.phase, 'deferred');
  state.streaming = false;
  state.recording = true;
  assert.equal((await auto.reconcile()).automation.phase, 'deferred');
  assert.equal(calls.setup, 0);
  state.recording = false;
  assert.equal((await auto.reconcile()).automation.ready, true);
  assert.equal(calls.setup, 1);
});

test('concurrent setup reconciliations are serialized', async () => {
  const { bridge, calls } = fakeObs();
  const auto = createObsAutomation(bridge, 3000);
  const [first, second, third] = await Promise.all([
    auto.reconcile(), auto.reconcile(), auto.reconcile()
  ]);
  assert.ok(first.automation.ready && second.automation.ready && third.automation.ready);
  assert.equal(calls.setup, 1);
});

test('pairing selects an existing stage without asking user to press setup again', async () => {
  const { bridge, state, calls } = fakeObs();
  state.sceneReady = true;
  state.canvas = { ...portrait };
  const auto = createObsAutomation(bridge, 3000);
  const result = await auto.pair('my-valid-password');
  assert.equal(result.automation.ready, true);
  assert.equal(calls.setup, 1, 'explicit pairing activates the existing scene');
  await auto.reconcile();
  assert.equal(calls.setup, 1, 'subsequent background checks are non-invasive');
});
