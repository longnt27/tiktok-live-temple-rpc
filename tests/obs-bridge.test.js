const test = require('node:test');
const assert = require('node:assert/strict');
const { WebSocketServer } = require('ws');
const { connectObs, getStatus, setupScene, action, setDestination } = require('../obs-bridge');

test('OBS bridge: authentication, status, idempotent scene and safe stream controls', async (t) => {
  const calls = [];
  const server = new WebSocketServer({ host: '127.0.0.1', port: 4455 });
  let scene = false;
  let input = false;
  let streaming = false;
  let recording = false;
  let streamServer = '';
  let streamKey = '';
  let video = { baseWidth: 1920, baseHeight: 1080, outputWidth: 1920,
    outputHeight: 1080, fpsNumerator: 60, fpsDenominator: 1 };
  t.after(async () => {
    for (const client of server.clients) client.terminate();
    await new Promise(resolve => server.close(resolve));
  });
  server.on('connection', ws => {
    ws.send(JSON.stringify({ op: 0, d: {
      obsWebSocketVersion: '5.5.0', rpcVersion: 1
    }}));
    ws.on('message', raw => {
      const req = JSON.parse(String(raw));
      if (req.op === 1) {
        ws.send(JSON.stringify({op:2,d:{negotiatedRpcVersion:1}}));
        return;
      }
      if (req.op !== 6) return;
      const { requestType, requestData = {}, requestId } = req.d;
      calls.push({ requestType, requestData });
      const ok = (responseData = {}) => ws.send(JSON.stringify({
        op: 7, d: { requestId, requestType, requestStatus: {result:true,code:100}, responseData }
      }));
      const error = (comment) => ws.send(JSON.stringify({
        op: 7, d: { requestId, requestType, requestStatus: {result:false,code:401,comment} }
      }));
      switch (requestType) {
        case 'GetVersion': ok({obsVersion:'31.0.0'}); break;
        case 'GetVideoSettings': ok(video); break;
        case 'SetVideoSettings': video = requestData; ok(); break;
        case 'GetStreamStatus': ok({outputActive: streaming}); break;
        case 'GetRecordStatus': ok({outputActive: recording}); break;
        case 'GetSceneList': ok({scenes:scene?[{sceneName:'Chua Online | TikTok 9:16'}]:[],
          currentProgramSceneName:scene?'Chua Online | TikTok 9:16':'Scene'}); break;
        case 'CreateScene': scene = true; ok(); break;
        case 'GetInputList': ok({inputs:input?[{inputName:'Chua Online | Browser Source',inputKind:'browser_source'}]:[]}); break;
        case 'CreateInput': input = true; ok(); break;
        case 'GetSceneItemList': ok({sceneItems:input?[{sceneItemId:1,sourceName:'Chua Online | Browser Source'}]:[]}); break;
        case 'SetSceneItemTransform':
        case 'SetSceneItemEnabled':
        case 'SetInputSettings':
        case 'SetCurrentProgramScene': ok(); break;
        case 'GetStreamServiceSettings': ok({streamServiceType:'rtmp_custom',
          streamServiceSettings:{server:streamServer,key:streamKey}}); break;
        case 'SetStreamServiceSettings':
          streamServer=requestData.streamServiceSettings.server;
          streamKey=requestData.streamServiceSettings.key;
          ok(); break;
        case 'StartStream': streaming=true; ok(); break;
        case 'StopStream': streaming=false; ok(); break;
        case 'StartRecord': recording=true; ok(); break;
        case 'StopRecord': recording=false; ok(); break;
        default: error('Unsupported fake request: '+requestType);
      }
    });
  });
  await new Promise(resolve => server.on('listening', resolve));
  const connected = await connectObs();
  connected.close();
  const initial=await getStatus();
  assert.equal(initial.connected,true);
  assert.equal(initial.sceneReady,false);
  await setupScene(3000);
  const createdSceneCalls=calls.filter(c=>c.requestType==='CreateScene').length;
  await setupScene(3000);
  assert.equal(calls.filter(c=>c.requestType==='CreateScene').length,createdSceneCalls);
  assert.equal(calls.filter(c=>c.requestType==='CreateInput').length,1);
  const source=calls.find(c=>c.requestType==='CreateInput');
  assert.equal(source.requestData.inputSettings.url,'http://127.0.0.1:3000/?obs=1');
  assert.equal(source.requestData.inputSettings.reroute_audio,true);
  assert.equal(video.baseWidth,1080);
  assert.equal(video.baseHeight,1920);

  await assert.rejects(()=>setDestination('https://not-rtmp.example','key'),/RTMP/);
  await setDestination('rtmps://live.example.com:443/app','very-secret-stream-key');
  const config=await getStatus();
  assert.equal(config.destinationConfigured,true);
  assert.equal(config.sceneReady,true);
  assert.equal(JSON.stringify(config).includes('very-secret-stream-key'),false);
  await action('startStream');
  await assert.rejects(()=>setDestination('rtmp://example.com/app','updated-key'),/Dung livestream/);
  assert.equal((await getStatus()).streaming,true);
  await action('stopStream');
  await action('startRecord');
  assert.equal((await getStatus()).recording,true);
  await action('stopRecord');
  await assert.rejects(()=>action('DeleteScene'),/khong duoc ho tro/);
});
