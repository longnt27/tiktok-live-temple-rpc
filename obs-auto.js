'use strict';

// OBS setup is a repeatable local reconciliation step, not a second button
// the streamer has to remember to press after connecting.
function createObsAutomation(bridge, port, { intervalMs = 6000 } = {}) {
  let ready = false;
  let phase = 'waiting';
  let lastError = null;
  let task = null;
  let timer = null;

  function canvasReady(obs) {
    return obs.canvas?.width === 1080 &&
      obs.canvas?.height === 1920 &&
      obs.canvas?.outputWidth === 1080 &&
      obs.canvas?.outputHeight === 1920 &&
      Math.round(obs.canvas?.fps) === 30;
  }

  async function reconcile() {
    if (task) return task;
    task = (async () => {
      const obs = await bridge.getStatus();
      if (!obs.connected) {
        ready = false;
        phase = 'waiting';
        lastError = obs.error || 'OBS chua san sang';
        return { ...obs, automation: status() };
      }

      if (obs.sceneReady && canvasReady(obs)) {
        ready = true;
        phase = 'ready';
        lastError = null;
        return { ...obs, automation: status() };
      }

      // Never change canvas or program scene in the middle of recording/live.
      if (obs.streaming || obs.recording) {
        ready = false;
        phase = 'deferred';
        lastError = 'Dang phat LIVE hoac ghi hinh. OBS se tu tao scene sau khi dung.';
        return { ...obs, automation: status() };
      }

      ready = false;
      phase = 'configuring';
      lastError = null;
      try {
        await bridge.setupScene(port);
        ready = true;
        phase = 'ready';
        return { ...await bridge.getStatus(), automation: status() };
      } catch (err) {
        phase = 'error';
        lastError = err.message;
        return { ...obs, automation: status() };
      }
    })().finally(() => { task = null; });
    return task;
  }

  async function pair(password) {
    // Avoid writing an incorrect password to disk. First validate the actual
    // OBS v5 WebSocket handshake, then save it and configure the stage.
    if (task) await task;
    const session = await bridge.connectObs(password);
    session.close();
    bridge.savePassword(password);
    ready = false;
    return reconcile();
  }

  function status() {
    return { ready, phase, lastError };
  }

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      reconcile().catch(err => {
        phase = 'error';
        lastError = err.message;
      });
    }, intervalMs);
    timer.unref?.();
    reconcile().catch(err => {
      phase = 'error';
      lastError = err.message;
    });
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { reconcile, pair, status, start, stop };
}

module.exports = { createObsAutomation };
