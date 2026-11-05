'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocket } = require('ws');
const { execFile } = require('child_process');

const SCENE = 'Chua Online | TikTok 9:16';
const INPUT = 'Chua Online | Browser Source';
const CONFIG = path.join(__dirname, 'data', 'obs-config.json');
const WS_URL = 'ws://127.0.0.1:4455';

function getPassword() {
  try {
    return String(JSON.parse(fs.readFileSync(CONFIG, 'utf8')).password || '');
  } catch (_) {
    return '';
  }
}

function savePassword(password) {
  if (typeof password !== 'string' || password.length > 256) {
    throw new Error('Mat khau OBS khong hop le (toi da 256 ky tu).');
  }
  fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
  fs.writeFileSync(CONFIG, JSON.stringify({ password }), { mode: 0o600 });
  fs.chmodSync(CONFIG, 0o600);
}

class ObsSession {
  constructor(ws) { this.ws = ws; }

  request(requestType, requestData = {}) {
    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('OBS khong phan hoi: ' + requestType));
      }, 7000);

      const cleanup = () => {
        clearTimeout(timer);
        this.ws.off('message', onMessage);
        this.ws.off('close', onClose);
        this.ws.off('error', onError);
      };
      const onClose = () => {
        cleanup();
        reject(new Error('Ket noi OBS bi ngat.'));
      };
      const onError = (err) => {
        cleanup();
        reject(err);
      };
      const onMessage = (raw) => {
        let message;
        try { message = JSON.parse(String(raw)); } catch (_) { return; }
        if (message.op !== 7 || message.d?.requestId !== requestId) return;
        cleanup();
        if (message.d.requestStatus?.result) {
          resolve(message.d.responseData || {});
        } else {
          reject(new Error(message.d.requestStatus?.comment ||
            'OBS tu choi lenh ' + requestType + ' (' + message.d.requestStatus?.code + ')'));
        }
      };

      this.ws.on('message', onMessage);
      this.ws.on('close', onClose);
      this.ws.on('error', onError);
      try {
        this.ws.send(JSON.stringify({
          op: 6,
          d: { requestType, requestId, requestData }
        }));
      } catch (err) {
        cleanup();
        reject(err);
      }
    });
  }

  close() { this.ws.close(); }
}

function connectObs(password = getPassword()) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(WS_URL, { handshakeTimeout: 5000 });
    let done = false;
    const timer = setTimeout(() => finish(new Error('Khong the ket noi OBS (timeout).')), 6000);

    function finish(error, session) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        socket.close();
        reject(error);
      } else {
        resolve(session);
      }
    }

    socket.on('error', err => finish(new Error(
      'Khong the ket noi OBS WebSocket tai 127.0.0.1:4455: ' + err.message
    )));
    socket.on('close', (code, reason) => {
      const detail = reason ? String(reason) : '';
      const authFailed = code === 4009 || /auth|password/i.test(detail);
      finish(new Error(authFailed
        ? 'Mat khau OBS khong dung. Kiem tra Tools > WebSocket Server Settings.'
        : 'OBS dong ket noi. Kiem tra WebSocket (port 4455). ' + detail));
    });
    socket.on('message', raw => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.op === 0) {
          const identify = { rpcVersion: 1 };
          if (msg.d.authentication) {
            if (!password) {
              finish(new Error('OBS yeu cau mat khau WebSocket. Nhap mat khau tren dashboard.'));
              return;
            }
            const auth = msg.d.authentication;
            const secret = crypto.createHash('sha256')
              .update(password + auth.salt).digest('base64');
            identify.authentication = crypto.createHash('sha256')
              .update(secret + auth.challenge).digest('base64');
          }
          socket.send(JSON.stringify({ op: 1, d: identify }));
        } else if (msg.op === 2) {
          finish(null, new ObsSession(socket));
        }
      } catch (err) {
        finish(err);
      }
    });
  });
}

async function withObs(callback) {
  const session = await connectObs();
  try { return await callback(session); }
  finally { session.close(); }
}

async function getStatus() {
  try {
    return await withObs(async obs => {
      const [version, video, stream, record, scenes, inputs, service] = await Promise.all([
        obs.request('GetVersion'),
        obs.request('GetVideoSettings'),
        obs.request('GetStreamStatus'),
        obs.request('GetRecordStatus'),
        obs.request('GetSceneList'),
        obs.request('GetInputList'),
        obs.request('GetStreamServiceSettings')
      ]);
      const streamSettings = service.streamServiceSettings || {};
      return {
        connected: true,
        version: version.obsVersion,
        streaming: Boolean(stream.outputActive),
        recording: Boolean(record.outputActive),
        sceneReady: (scenes.scenes || []).some(item => item.sceneName === SCENE) &&
          (inputs.inputs || []).some(item => item.inputName === INPUT),
        currentScene: scenes.currentProgramSceneName,
        canvas: {
          width: video.baseWidth, height: video.baseHeight,
          outputWidth: video.outputWidth, outputHeight: video.outputHeight,
          fps: video.fpsNumerator / video.fpsDenominator
        },
        destinationConfigured: Boolean(streamSettings.server && streamSettings.key),
        destinationServer: typeof streamSettings.server === 'string'
          ? streamSettings.server : ''
        // Never return or log the stream key or OBS password.
      };
    });
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

async function setupScene(port = 3000) {
  return withObs(async obs => {
    const stream = await obs.request('GetStreamStatus');
    const record = await obs.request('GetRecordStatus');
    const video = await obs.request('GetVideoSettings');

    if (video.baseWidth !== 1080 || video.baseHeight !== 1920 ||
        video.outputWidth !== 1080 || video.outputHeight !== 1920 ||
        Math.round(video.fpsNumerator / video.fpsDenominator) !== 30) {
      if (stream.outputActive || record.outputActive) {
        throw new Error('Dung stream/record truoc khi doi canvas sang 1080x1920.');
      }
      await obs.request('SetVideoSettings', {
        baseWidth: 1080, baseHeight: 1920,
        outputWidth: 1080, outputHeight: 1920,
        fpsNumerator: 30, fpsDenominator: 1
      });
    }

    const scenes = await obs.request('GetSceneList');
    if (!(scenes.scenes || []).some(item => item.sceneName === SCENE)) {
      await obs.request('CreateScene', { sceneName: SCENE });
    }

    const settings = {
      url: 'http://127.0.0.1:' + port + '/?obs=1',
      width: 1080, height: 1920, fps: 30,
      reroute_audio: true, shutdown: false, restart_when_active: false
    };
    const inputList = await obs.request('GetInputList');
    const existing = (inputList.inputs || []).find(item => item.inputName === INPUT);
    if (!existing) {
      await obs.request('CreateInput', {
        sceneName: SCENE, inputName: INPUT, inputKind: 'browser_source',
        inputSettings: settings, sceneItemEnabled: true
      });
    } else {
      if (existing.inputKind !== 'browser_source') {
        throw new Error('OBS dang co source trung ten nhung khong phai Browser Source.');
      }
      await obs.request('SetInputSettings', {
        inputName: INPUT, inputSettings: settings, overlay: true
      });
      const items = await obs.request('GetSceneItemList', { sceneName: SCENE });
      if (!(items.sceneItems || []).some(item => item.sourceName === INPUT)) {
        await obs.request('CreateSceneItem', {
          sceneName: SCENE, sourceName: INPUT, sceneItemEnabled: true
        });
      }
    }

    const items = await obs.request('GetSceneItemList', { sceneName: SCENE });
    const item = (items.sceneItems || []).find(entry => entry.sourceName === INPUT);
    if (item) {
      await obs.request('SetSceneItemEnabled', {
        sceneName: SCENE, sceneItemId: item.sceneItemId, sceneItemEnabled: true
      });
      await obs.request('SetSceneItemTransform', {
        sceneName: SCENE, sceneItemId: item.sceneItemId,
        sceneItemTransform: {
          positionX: 0, positionY: 0,
          scaleX: 1, scaleY: 1, alignment: 5
        }
      });
    }
    await obs.request('SetCurrentProgramScene', { sceneName: SCENE });
    return { ok: true, sceneName: SCENE, sourceName: INPUT };
  });
}

async function setDestination(server, key) {
  if (typeof server !== 'string' || !/^rtmps?:\/\/[^\s/]+/i.test(server) ||
      server.length > 2048 || typeof key !== 'string' ||
      !key.trim() || key.length > 2048) {
    throw new Error('Can RTMP/RTMPS server URL va Stream Key hop le tu TikTok.');
  }
  return withObs(async obs => {
    const status = await obs.request('GetStreamStatus');
    if (status.outputActive) {
      throw new Error('Dung livestream truoc khi doi Stream Key.');
    }
    await obs.request('SetStreamServiceSettings', {
      streamServiceType: 'rtmp_custom',
      streamServiceSettings: { server: server.trim(), key: key.trim() }
    });
    return { ok: true };
  });
}

const SAFE_ACTIONS = {
  startStream: 'StartStream',
  stopStream: 'StopStream',
  startRecord: 'StartRecord',
  stopRecord: 'StopRecord'
};

async function action(name) {
  if (!Object.hasOwn(SAFE_ACTIONS, name)) {
    throw new Error('Lenh OBS khong duoc ho tro.');
  }
  return withObs(async obs => {
    await obs.request(SAFE_ACTIONS[name]);
    return { ok: true };
  });
}

function openObs() {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'darwin') {
      reject(new Error('Chi ho tro mo OBS tren macOS.'));
      return;
    }
    execFile('/usr/bin/open', ['-a', 'OBS'], err => {
      if (err) reject(new Error('Khong the mo OBS. Kiem tra OBS Studio da duoc cai.'));
      else resolve({ ok: true });
    });
  });
}

module.exports = { connectObs, getStatus, setupScene, setDestination, action,
  openObs, savePassword, SCENE, INPUT };
