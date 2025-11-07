import * as path from 'node:path';
import { pathToFileURL } from 'node:url';

import { BrowserWindow, nativeTheme, shell } from 'electron';

// import { createContextMenu } from './context-menu';
import { ipcMainManager } from './ipc';
import { IpcEvents } from '../ipc-events';
import { isDevMode } from './utils/devmode';

// Keep a global reference of the window objects, if we don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
export let browserWindows: Array<BrowserWindow | null> = [];

// Global variables exposed by forge/webpack-plugin to reference
// the entry point of preload and index.html over http://
declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

let mainIsReadyResolver: () => void;
const mainIsReadyPromise = new Promise<void>(
  (resolve) => (mainIsReadyResolver = resolve),
);

export function mainIsReady() {
  mainIsReadyResolver();
}

export function safelyOpenWebURL(url: string) {
  try {
    const { protocol } = new URL(url);
    if (['http:', 'https:'].includes(protocol)) {
      shell.openExternal(url);
    }
  } catch {}
}

/**
 * Gets default options for the main window
 */
export function getMainWindowOptions(): Electron.BrowserWindowConstructorOptions {
  const HEADER_COMMANDS_HEIGHT = 50;
  const MACOS_TRAFFIC_LIGHTS_HEIGHT = 16;

  // 根据系统主题设置背景色
  const backgroundColor = nativeTheme.shouldUseDarkColors
    ? '#1d2427'
    : '#ffffff';

  return {
    width: 1400,
    height: 900,
    minHeight: 600,
    minWidth: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : undefined,
    titleBarOverlay: process.platform === 'darwin',
    trafficLightPosition: {
      x: 20,
      y: HEADER_COMMANDS_HEIGHT / 2 - MACOS_TRAFFIC_LIGHTS_HEIGHT / 2,
    },
    acceptFirstMouse: true,
    backgroundColor,
    show: false,
    // 隐藏顶部菜单栏
    autoHideMenuBar: true,
    webPreferences: {
      webviewTag: true,
      preload: !!process.env.JEST
        ? path.join(process.cwd(), './.webpack/renderer/main_window/preload.js')
        : MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  };
}

/**
 * Creates a new main window.
 */
export function createMainWindow(): Electron.BrowserWindow {
  console.log(`Creating main window`);
  let browserWindow: BrowserWindow | null;
  browserWindow = new BrowserWindow(getMainWindowOptions());

  // 加载编译好的静态前端文件
  if (!!process.env.JEST) {
    browserWindow.loadURL(
      pathToFileURL(
        path.join(process.cwd(), './.webpack/renderer/main_window/index.html'),
      ).href,
    );
  } else if (isDevMode()) {
    // 开发模式：从源码目录加载，使用 loadFile 可以正确处理相对路径
    browserWindow.loadFile(
      path.join(process.cwd(), 'static/mh-f13/index.html'),
    );
  } else {
    // 生产模式：从打包后的目录加载
    // 使用 __dirname 可以正确访问 .asar 文件中的路径
    const staticHtmlPath = path.join(__dirname, '../static/mh-f13/index.html');
    browserWindow.loadFile(staticHtmlPath);
  }

  browserWindow.webContents.once('dom-ready', () => {
    if (browserWindow) {
      browserWindow.show();

      // 禁用右键菜单
      // createContextMenu(browserWindow);
    }
  });

  // 监听系统主题变化，更新窗口背景色
  const updateBackgroundColor = () => {
    if (browserWindow && !browserWindow.isDestroyed()) {
      const backgroundColor = nativeTheme.shouldUseDarkColors
        ? '#1d2427'
        : '#ffffff';
      browserWindow.setBackgroundColor(backgroundColor);
    }
  };

  nativeTheme.on('updated', updateBackgroundColor);

  browserWindow.on('focus', () => {
    if (browserWindow) {
      ipcMainManager.send(IpcEvents.SET_SHOW_ME_TEMPLATE);
    }
  });

  browserWindow.on('closed', () => {
    nativeTheme.removeListener('updated', updateBackgroundColor);
    browserWindows = browserWindows.filter((bw) => browserWindow !== bw);

    browserWindow = null;
  });

  browserWindow.webContents.setWindowOpenHandler((details) => {
    safelyOpenWebURL(details.url);
    return { action: 'deny' };
  });

  browserWindow.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
    safelyOpenWebURL(url);
  });

  ipcMainManager.on(IpcEvents.RELOAD_WINDOW, () => {
    browserWindow?.reload();
  });

  browserWindows.push(browserWindow);

  return browserWindow;
}

/**
 * Gets or creates the main window, returning it in both cases.
 */
export async function getOrCreateMainWindow(): Promise<Electron.BrowserWindow> {
  await mainIsReadyPromise;
  return (
    BrowserWindow.getFocusedWindow() || browserWindows[0] || createMainWindow()
  );
}
