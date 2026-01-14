import { ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

import dotenv from 'dotenv';
import { IpcMainEvent } from 'electron';

import { ipcMainManager } from './ipc';
import { IpcEvents } from '../ipc-events';

/**
 * TachybaseEngine class
 *
 * enginePort 现在存的是完整的 url
 */
export class TachybaseEngine {
  private engineStatus = 'ready';
  private enginePort = '';
  private child: ChildProcessWithoutNullStreams | null = null;

  constructor() {
    ipcMainManager.on(IpcEvents.GET_ENGINE_STATUS, (event) => {
      event.returnValue = this.engineStatus + '|' + this.enginePort;
    });

    // ipcMainManager.handle(
    //   IpcEvents.ENGINE_START,
    //   (_: IpcMainEvent, env: string) => this.start.bind(this)(env),
    // );
    ipcMainManager.handle(IpcEvents.ENGINE_STOP, (_: IpcMainEvent) =>
      this.stop.bind(this)(),
    );

    this.start('');
  }

  async start(rawEnvString: string) {
    const env = dotenv.parse(rawEnvString);

    const enabled = env.ENGINE_ENABLED === '1';
    const enginePath = env.ENGINE_PATH;
    const workingDir = env.ENGINE_WORKING_DIR;
    const appPort = env.APP_PORT;
    let remoteUrl = env.REMOTE_URL;

    if (!enabled && !remoteUrl) {
      throw new Error('REMOTE_URL must be set when engine is disabled');
    }

    if (!enabled && remoteUrl) {
      this.engineStatus = 'remote';
      this.enginePort = remoteUrl;
      ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, [
        'remote',
        remoteUrl,
      ]);
      return;
    }

    if (!enginePath || !workingDir || !appPort) {
      throw new Error(
        'ENGINE_PATH, ENGINE_WORKING_DIR, and APP_PORT must be set',
      );
    }
    if (!remoteUrl) {
      remoteUrl = `http://localhost:${appPort}/signin`;
    }

    env.NODE_MODULES_PATH = path.join(workingDir, 'plugins/node_modules');

    this.engineStatus = 'started';
    ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, ['started']);

    const checkRunning = async () => {
      try {
        const result = await fetch(`${remoteUrl}/api/__health_check`);
        const res = await result.text();
        if (res !== 'ok') {
          throw new Error('server not ready');
        }
        this.enginePort = remoteUrl;
        this.engineStatus = 'ready';
        ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, [
          'ready',
          remoteUrl,
        ]);
      } catch {
        setTimeout(() => {
          checkRunning();
        }, 500);
      }
    };

    // await checkRunning();

    // this.child = spawn(enginePath, ['start', '--quickstart'], {
    //   cwd: workingDir,
    //   env,
    //   stdio: 'pipe',
    // });
    // this.child.stdout.on('data', (data) => {
    //   ipcMainManager.send(IpcEvents.ENGINE_STDOUT, [data.toString()]);
    // });

    // this.child.stderr.on('data', (data) => {
    //   ipcMainManager.send(IpcEvents.ENGINE_STDERR, [data.toString()]);
    // });

    // this.child.on('error', (error) => {
    //   console.error(`[Engine]: Error starting engine: ${error.message}`);
    // });

    // this.child.on('exit', (code) => {
    //   console.log(`[Engine]: engine exited with code ${code}`);

    //   if (this.engineStatus !== 'stopped') {
    //     this.engineStatus = 'stopped';
    //     ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, ['stopped']);
    //   }
    // });
  }

  async stop() {
    if (this.engineStatus === 'ready' || this.engineStatus === 'started') {
      this.child?.kill();
      this.engineStatus = 'stopped';
      ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, ['stopped']);
    } else if (this.engineStatus === 'remote') {
      this.engineStatus = 'stopped';
      ipcMainManager.send(IpcEvents.ENGINE_STATUS_CHANGED, ['stopped']);
    }
  }
}
