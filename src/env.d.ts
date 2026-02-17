/// <reference types="vite/client" />

declare module "*.png" {
  const src: string;
  export default src;
}

declare module "*.svg" {
  const src: string;
  export default src;
}

declare module "*.jpg" {
  const src: string;
  export default src;
}

declare module "*.gif" {
  const src: string;
  export default src;
}

interface ElectronAPI {
  invoke: (channel: string, ...args: any[]) => Promise<any>;
  send: (channel: string, ...args: any[]) => void;
  on: (channel: string, callback: (...args: any[]) => void) => () => void;
  off: (channel: string, callback: (...args: any[]) => void) => void;
  readFileSync: (filePath: string) => string;
  writeFileSync: (filePath: string, content: string) => void;
  writeFileBinary: (filePath: string, base64Data: string) => void;
  fileExists: (filePath: string) => boolean;
  getTempDir: () => string;
}

declare module "glob" {
  export function glob(pattern: string, options?: any): Promise<string[]>;
}

interface Window {
  electronAPI: ElectronAPI;
  electron?: ElectronAPI;
  Electron?: any;
}
