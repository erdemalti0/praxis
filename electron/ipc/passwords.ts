import { ipcMain, safeStorage } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

interface Credential {
  id: string;
  url: string;
  domain: string;
  username: string;
  password: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

interface CredentialMeta {
  id: string;
  url: string;
  domain: string;
  username: string;
  createdAt: number;
  updatedAt: number;
  lastUsedAt?: number;
}

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;
const AUTH_TAG_LENGTH = 16;

function getDataDir(): string {
  return path.join(os.homedir(), ".praxis");
}

function getCredentialsPath(): string {
  return path.join(getDataDir(), "credentials.enc");
}

function getKeyPath(): string {
  return path.join(getDataDir(), "key.bin");
}

function ensureDataDir(): void {
  const dir = getDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getOrCreateEncryptionKey(): Buffer {
  ensureDataDir();
  const keyPath = getKeyPath();

  if (fs.existsSync(keyPath)) {
    const encryptedKey = fs.readFileSync(keyPath);
    try {
      if (safeStorage.isEncryptionAvailable()) {
        return safeStorage.decryptString(encryptedKey as any) as any;
      }
      return encryptedKey;
    } catch {
      return createAndSaveKey();
    }
  }

  return createAndSaveKey();
}

function createAndSaveKey(): Buffer {
  ensureDataDir();
  const key = crypto.randomBytes(KEY_LENGTH);
  const keyPath = getKeyPath();

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key.toString("base64"));
      fs.writeFileSync(keyPath, encrypted as any);
    } else {
      fs.writeFileSync(keyPath, key);
    }
  } catch {
    fs.writeFileSync(keyPath, key);
  }

  return key;
}

function encrypt(text: string, key: Buffer): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);

  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, "sha512");

  const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  const combined = Buffer.concat([
    salt,
    iv,
    authTag,
    Buffer.from(encrypted, "hex"),
  ]);

  return combined.toString("base64");
}

function decrypt(encryptedData: string, key: Buffer): string {
  const combined = Buffer.from(encryptedData, "base64");

  const salt = combined.subarray(0, SALT_LENGTH);
  const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
  const authTag = combined.subarray(
    SALT_LENGTH + IV_LENGTH,
    SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
  );
  const encrypted = combined.subarray(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

  const derivedKey = crypto.pbkdf2Sync(key, salt, 100000, KEY_LENGTH, "sha512");

  const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, undefined, "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
}

export function registerPasswordHandlers() {
  ipcMain.handle(
    "save_credential",
    async (_event, args: { url: string; username: string; password: string }): Promise<CredentialMeta> => {
      const { url, username, password } = args;
      const key = getOrCreateEncryptionKey();
      ensureDataDir();

      let credentials: Credential[] = [];
      const filePath = getCredentialsPath();

      if (fs.existsSync(filePath)) {
        try {
          const encryptedData = fs.readFileSync(filePath, "utf-8");
          const decryptedData = decrypt(encryptedData, key);
          credentials = JSON.parse(decryptedData);
        } catch {
          credentials = [];
        }
      }

      const domain = extractDomain(url);
      const existingIndex = credentials.findIndex(
        (c) => c.domain === domain && c.username === username
      );

      const now = Date.now();
      const credential: Credential = {
        id: existingIndex >= 0 ? credentials[existingIndex].id : `cred-${now}`,
        url,
        domain,
        username,
        password,
        createdAt: existingIndex >= 0 ? credentials[existingIndex].createdAt : now,
        updatedAt: now,
      };

      if (existingIndex >= 0) {
        credentials[existingIndex] = credential;
      } else {
        credentials.push(credential);
      }

      const encryptedData = encrypt(JSON.stringify(credentials), key);
      fs.writeFileSync(filePath, encryptedData, "utf-8");

      return {
        id: credential.id,
        url: credential.url,
        domain: credential.domain,
        username: credential.username,
        createdAt: credential.createdAt,
        updatedAt: credential.updatedAt,
      };
    }
  );

  ipcMain.handle("get_credentials", async (): Promise<CredentialMeta[]> => {
    const key = getOrCreateEncryptionKey();
    const filePath = getCredentialsPath();

    if (!fs.existsSync(filePath)) {
      return [];
    }

    try {
      const encryptedData = fs.readFileSync(filePath, "utf-8");
      const decryptedData = decrypt(encryptedData, key);
      const credentials: Credential[] = JSON.parse(decryptedData);

      return credentials.map((c) => ({
        id: c.id,
        url: c.url,
        domain: c.domain,
        username: c.username,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastUsedAt: c.lastUsedAt,
      }));
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "get_credential_password",
    async (_event, args: { id: string }): Promise<string | null> => {
      const { id } = args;
      const key = getOrCreateEncryptionKey();
      const filePath = getCredentialsPath();

      if (!fs.existsSync(filePath)) {
        return null;
      }

      try {
        const encryptedData = fs.readFileSync(filePath, "utf-8");
        const decryptedData = decrypt(encryptedData, key);
        const credentials: Credential[] = JSON.parse(decryptedData);

        const credential = credentials.find((c) => c.id === id);
        if (!credential) {
          return null;
        }

        credential.lastUsedAt = Date.now();
        const reEncrypted = encrypt(JSON.stringify(credentials), key);
        fs.writeFileSync(filePath, reEncrypted, "utf-8");

        return credential.password;
      } catch {
        return null;
      }
    }
  );

  ipcMain.handle(
    "get_credentials_for_url",
    async (_event, args: { url: string }): Promise<CredentialMeta[]> => {
      const { url } = args;
      const key = getOrCreateEncryptionKey();
      const filePath = getCredentialsPath();

      if (!fs.existsSync(filePath)) {
        return [];
      }

      try {
        const encryptedData = fs.readFileSync(filePath, "utf-8");
        const decryptedData = decrypt(encryptedData, key);
        const credentials: Credential[] = JSON.parse(decryptedData);

        const domain = extractDomain(url);
        const matching = credentials.filter((c) => c.domain === domain);

        return matching.map((c) => ({
          id: c.id,
          url: c.url,
          domain: c.domain,
          username: c.username,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          lastUsedAt: c.lastUsedAt,
        }));
      } catch {
        return [];
      }
    }
  );

  ipcMain.handle("delete_credential", async (_event, args: { id: string }): Promise<boolean> => {
    const { id } = args;
    const key = getOrCreateEncryptionKey();
    const filePath = getCredentialsPath();

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const encryptedData = fs.readFileSync(filePath, "utf-8");
      const decryptedData = decrypt(encryptedData, key);
      const credentials: Credential[] = JSON.parse(decryptedData);

      const filtered = credentials.filter((c) => c.id !== id);

      if (filtered.length === credentials.length) {
        return false;
      }

      const reEncrypted = encrypt(JSON.stringify(filtered), key);
      fs.writeFileSync(filePath, reEncrypted, "utf-8");

      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("update_credential", async (_event, args: {
    id: string;
    username?: string;
    password?: string;
  }): Promise<boolean> => {
    const { id, username, password } = args;
    const key = getOrCreateEncryptionKey();
    const filePath = getCredentialsPath();

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const encryptedData = fs.readFileSync(filePath, "utf-8");
      const decryptedData = decrypt(encryptedData, key);
      const credentials: Credential[] = JSON.parse(decryptedData);

      const index = credentials.findIndex((c) => c.id === id);
      if (index === -1) {
        return false;
      }

      if (username !== undefined) {
        credentials[index].username = username;
      }
      if (password !== undefined) {
        credentials[index].password = password;
      }
      credentials[index].updatedAt = Date.now();

      const reEncrypted = encrypt(JSON.stringify(credentials), key);
      fs.writeFileSync(filePath, reEncrypted, "utf-8");

      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("has_credentials_for_url", async (_event, args: { url: string }): Promise<boolean> => {
    const { url } = args;
    const key = getOrCreateEncryptionKey();
    const filePath = getCredentialsPath();

    if (!fs.existsSync(filePath)) {
      return false;
    }

    try {
      const encryptedData = fs.readFileSync(filePath, "utf-8");
      const decryptedData = decrypt(encryptedData, key);
      const credentials: Credential[] = JSON.parse(decryptedData);

      const domain = extractDomain(url);
      return credentials.some((c) => c.domain === domain);
    } catch {
      return false;
    }
  });
}
