import { useState, useEffect } from "react";
import { Key, X, Eye, EyeOff, Trash2, Copy, Plus, Search, Globe, User, Clock, Shield, AlertTriangle } from "lucide-react";
import { usePasswordStore, type CredentialMeta } from "../../stores/passwordStore";
import { invoke } from "../../lib/ipc";

interface PasswordManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export function PasswordManager({ isOpen, onClose }: PasswordManagerProps) {
  const credentials = usePasswordStore((s) => s.credentials);
  const credentialsLoaded = usePasswordStore((s) => s.credentialsLoaded);
  const loadCredentials = usePasswordStore((s) => s.loadCredentials);
  const deleteCredential = usePasswordStore((s) => s.deleteCredential);
  const getPassword = usePasswordStore((s) => s.getPassword);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCredential, setSelectedCredential] = useState<CredentialMeta | null>(null);
  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !credentialsLoaded) {
      loadCredentials();
    }
  }, [isOpen, credentialsLoaded, loadCredentials]);

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedCredential(null);
      setRevealedPassword(null);
      setDeleteConfirm(null);
    }
  }, [isOpen]);

  const filteredCredentials = credentials.filter((cred) =>
    cred.domain.toLowerCase().includes(searchQuery.toLowerCase()) ||
    cred.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRevealPassword = async (cred: CredentialMeta) => {
    if (revealedPassword) {
      setRevealedPassword(null);
      return;
    }

    const password = await getPassword(cred.id);
    if (password) {
      setRevealedPassword(password);
    }
  };

  const handleCopyPassword = async (cred: CredentialMeta) => {
    const password = await getPassword(cred.id);
    if (password) {
      await navigator.clipboard.writeText(password);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteCredential(id);
    setDeleteConfirm(null);
    if (selectedCredential?.id === id) {
      setSelectedCredential(null);
      setRevealedPassword(null);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: "var(--vp-bg-overlay)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: 720,
          height: 520,
          background: "var(--vp-bg-secondary)",
          border: "1px solid var(--vp-border-light)",
          borderRadius: 16,
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{
            borderBottom: "1px solid var(--vp-border-subtle)",
            background: "var(--vp-bg-surface)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "var(--vp-accent-blue-bg)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Shield size={16} style={{ color: "var(--vp-accent-blue)" }} />
            </div>
            <span style={{ color: "var(--vp-text-primary)", fontSize: 15, fontWeight: 600 }}>
              Password Manager
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              color: "var(--vp-text-faint)",
              padding: 6,
              borderRadius: 8,
              background: "transparent",
              border: "none",
              cursor: "pointer",
            }}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="flex"
          style={{ flex: 1, minHeight: 0 }}
        >
          <div
            style={{
              width: 280,
              borderRight: "1px solid var(--vp-bg-surface-hover)",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div style={{ padding: "12px 14px" }}>
              <div
                className="flex items-center gap-2"
                style={{
                  background: "var(--vp-bg-surface)",
                  borderRadius: 8,
                  padding: "8px 12px",
                }}
              >
                <Search size={14} style={{ color: "var(--vp-text-faint)" }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search passwords..."
                  style={{
                    flex: 1,
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--vp-text-secondary)",
                    fontSize: 12,
                  }}
                />
              </div>
            </div>

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "0 8px 8px",
              }}
            >
              {filteredCredentials.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center"
                  style={{ padding: 40, color: "var(--vp-text-subtle)" }}
                >
                  <Key size={32} style={{ marginBottom: 12, opacity: 0.5 }} />
                  <span style={{ fontSize: 13 }}>
                    {searchQuery ? "No matching passwords" : "No saved passwords"}
                  </span>
                </div>
              ) : (
                filteredCredentials.map((cred) => (
                  <div
                    key={cred.id}
                    onClick={() => {
                      setSelectedCredential(cred);
                      setRevealedPassword(null);
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      cursor: "pointer",
                      background: selectedCredential?.id === cred.id
                        ? "var(--vp-border-subtle)"
                        : "transparent",
                      marginBottom: 2,
                      transition: "background 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      if (selectedCredential?.id !== cred.id) {
                        e.currentTarget.style.background = "var(--vp-bg-surface)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedCredential?.id !== cred.id) {
                        e.currentTarget.style.background = "transparent";
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${cred.domain}&sz=16`}
                        alt=""
                        style={{ width: 16, height: 16, borderRadius: 3 }}
                      />
                      <span
                        style={{
                          color: "var(--vp-text-primary)",
                          fontSize: 12,
                          fontWeight: 500,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {cred.username}
                      </span>
                    </div>
                    <div
                      style={{
                        color: "var(--vp-text-faint)",
                        fontSize: 11,
                        marginTop: 2,
                        marginLeft: 22,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cred.domain}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div
              style={{
                padding: "10px 14px",
                borderTop: "1px solid var(--vp-bg-surface-hover)",
              }}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: "var(--vp-text-faint)", fontSize: 11 }}>
                  {credentials.length} password{credentials.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
            }}
          >
            {selectedCredential ? (
              <>
                <div
                  style={{
                    padding: "20px 24px",
                    borderBottom: "1px solid var(--vp-bg-surface-hover)",
                  }}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${selectedCredential.domain}&sz=32`}
                      alt=""
                      style={{ width: 32, height: 32, borderRadius: 6 }}
                    />
                    <div>
                      <div style={{ color: "var(--vp-text-primary)", fontSize: 14, fontWeight: 600 }}>
                        {selectedCredential.username}
                      </div>
                      <div style={{ color: "var(--vp-text-faint)", fontSize: 11 }}>
                        {selectedCredential.domain}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: 16 }}>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <User size={12} style={{ color: "var(--vp-text-faint)" }} />
                        <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>Username</span>
                      </div>
                      <div
                        className="flex items-center justify-between"
                        style={{
                          background: "var(--vp-bg-surface)",
                          borderRadius: 8,
                          padding: "10px 12px",
                        }}
                      >
                        <span style={{ color: "var(--vp-text-secondary)", fontSize: 12 }}>
                          {selectedCredential.username}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(selectedCredential.username);
                          }}
                          style={{
                            color: "var(--vp-text-faint)",
                            padding: 4,
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                          }}
                        >
                          <Copy size={12} />
                        </button>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Key size={12} style={{ color: "var(--vp-text-faint)" }} />
                        <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>Password</span>
                      </div>
                      <div
                        className="flex items-center justify-between"
                        style={{
                          background: "var(--vp-bg-surface)",
                          borderRadius: 8,
                          padding: "10px 12px",
                        }}
                      >
                        <span
                          style={{
                            color: "var(--vp-text-secondary)",
                            fontSize: 12,
                            fontFamily: "monospace",
                          }}
                        >
                          {revealedPassword || "••••••••••••"}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRevealPassword(selectedCredential)}
                            style={{
                              color: "var(--vp-text-faint)",
                              padding: 4,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            {revealedPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button
                            onClick={() => handleCopyPassword(selectedCredential)}
                            style={{
                              color: "var(--vp-text-faint)",
                              padding: 4,
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                            }}
                          >
                            <Copy size={12} />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Globe size={12} style={{ color: "var(--vp-text-faint)" }} />
                        <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>Website</span>
                      </div>
                      <div
                        className="flex items-center justify-between"
                        style={{
                          background: "var(--vp-bg-surface)",
                          borderRadius: 8,
                          padding: "10px 12px",
                        }}
                      >
                        <span style={{ color: "var(--vp-accent-blue)", fontSize: 12 }}>
                          {selectedCredential.url}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: "16px 24px",
                    borderBottom: "1px solid var(--vp-bg-surface-hover)",
                  }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Clock size={12} style={{ color: "var(--vp-text-faint)" }} />
                    <span style={{ color: "var(--vp-text-dim)", fontSize: 11 }}>History</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <span style={{ color: "var(--vp-text-faint)", fontSize: 10 }}>Created</span>
                      <div style={{ color: "var(--vp-text-muted)", fontSize: 12 }}>
                        {formatDate(selectedCredential.createdAt)}
                      </div>
                    </div>
                    <div>
                      <span style={{ color: "var(--vp-text-faint)", fontSize: 10 }}>Updated</span>
                      <div style={{ color: "var(--vp-text-muted)", fontSize: 12 }}>
                        {formatDate(selectedCredential.updatedAt)}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ padding: "16px 24px", marginTop: "auto" }}>
                  {deleteConfirm === selectedCredential.id ? (
                    <div
                      className="flex items-center gap-3"
                      style={{
                        background: "var(--vp-accent-red-bg)",
                        borderRadius: 10,
                        padding: "12px 14px",
                        border: "1px solid var(--vp-accent-red-border)",
                      }}
                    >
                      <AlertTriangle size={16} style={{ color: "var(--vp-accent-red-text)" }} />
                      <span style={{ color: "var(--vp-accent-red-text)", fontSize: 12, flex: 1 }}>
                        Delete this password?
                      </span>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        style={{
                          padding: "6px 12px",
                          background: "transparent",
                          border: "1px solid var(--vp-border-light)",
                          borderRadius: 6,
                          color: "var(--vp-text-muted)",
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleDelete(selectedCredential.id)}
                        style={{
                          padding: "6px 12px",
                          background: "var(--vp-accent-red-text)",
                          border: "none",
                          borderRadius: 6,
                          color: "var(--vp-button-primary-text)",
                          fontSize: 11,
                          fontWeight: 500,
                          cursor: "pointer",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(selectedCredential.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "10px 14px",
                        background: "transparent",
                        border: "1px solid var(--vp-accent-red-border)",
                        borderRadius: 8,
                        color: "var(--vp-accent-red-text)",
                        fontSize: 12,
                        cursor: "pointer",
                        transition: "all 0.15s",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "var(--vp-accent-red-bg)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "transparent";
                      }}
                    >
                      <Trash2 size={14} />
                      Delete Password
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div
                className="flex flex-col items-center justify-center"
                style={{ flex: 1, color: "var(--vp-text-subtle)" }}
              >
                <Key size={40} style={{ marginBottom: 16, opacity: 0.5 }} />
                <span style={{ fontSize: 13, marginBottom: 4 }}>
                  Select a password to view
                </span>
                <span style={{ fontSize: 11, color: "var(--vp-text-subtle)" }}>
                  {credentials.length} password{credentials.length !== 1 ? "s" : ""} saved
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
