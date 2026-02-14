declare global {
  interface Window {
    electronAPI: {
      invoke: (channel: string, ...args: any[]) => Promise<any>;
      on: (channel: string, callback: (...args: any[]) => void) => () => void;
      off: (channel: string, callback: (...args: any[]) => void) => void;
      readFileSync: (filePath: string) => string;
      writeFileSync: (filePath: string, content: string) => void;
      fileExists: (filePath: string) => boolean;
    };
  }
}

export function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  return window.electronAPI.invoke(cmd, args);
}

export function listen(event: string, cb: (...args: any[]) => void): () => void {
  return window.electronAPI.on(event, cb);
}

export function unlisten(event: string, cb: (...args: any[]) => void): void {
  window.electronAPI.off(event, cb);
}
