export function invoke<T = any>(cmd: string, args?: any): Promise<T> {
  return window.electronAPI.invoke(cmd, args);
}

/** Fire-and-forget IPC — no response awaited. Use for high-frequency writes (e.g. PTY input). */
export function send(channel: string, args?: any): void {
  window.electronAPI.send(channel, args);
}

export function listen(event: string, cb: (...args: any[]) => void): () => void {
  return window.electronAPI.on(event, cb);
}

export function unlisten(event: string, cb: (...args: any[]) => void): void {
  window.electronAPI.off(event, cb);
}
