"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ─────────────────────────────────────────────
// CONSTANTS & SEED DATA
// ─────────────────────────────────────────────

const STORAGE_KEY = "filmit-v2";

const STATUS_CONFIG = {
  idea:            { label: "Idea",                  emoji: "💡", pink: false },
  filming:         { label: "Filming",               emoji: "🎬", pink: false },
  uploaded_raw:    { label: "Needs Editing",         emoji: "📤", pink: false },
  uploaded_edited: { label: "Edited & Ready",        emoji: "✂️",  pink: false },
  published:       { label: "Published ✓",           emoji: "🚀", pink: true  },
};

const STATUS_COLORS = {
  idea:            { color: "#7c3aed", bg: "#f5f0ff" },
  filming:         { color: "#ea580c", bg: "#fff7ed" },
  uploaded_raw:    { color: "#b45309", bg: "#fefce8" },
  uploaded_edited: { color: "#16a34a", bg: "#f0fdf4" },
  published:       { color: "#ff0066", bg: "#fff0f6" },
};

const TAG_PALETTE = ["#ff0066", "#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#b45309"];
const tagColor = (tag) => TAG_PALETTE[tag.charCodeAt(0) % TAG_PALETTE.length];

const SEED_DATA = {
  role: null,
  agency: {
    name: "Your Agency",
  },
  clients: [
    {
      id: "client-1",
      name: "Jessica M.",
      handle: "@jessbudgetfit",
      niche: "Budget Fitness & Beauty",
      avatar: "J",
      color: "#ff0066",
      ideas: [
        { id: 1, type: "Reel", hook: "POV: You just found out you can eat this for $3", caption: "Budget breakfast that actually slaps 👏 #budgetfitness #mealprep", tags: ["fitness", "budget", "food"], status: "idea", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
        { id: 2, type: "Reel", hook: "The $12 makeup dupe that replaced my $60 foundation", caption: "I tested it for 2 weeks. Here's the verdict 👀 #makeupdupes #budgetbeauty", tags: ["makeup", "dupes", "budget"], status: "filming", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
        { id: 3, type: "Post", hook: "My full-body workout with zero equipment (and a baby on my hip)", caption: "No gym needed. No excuses needed. Just you 💪 #momlife #homeworkout", tags: ["fitness", "momlife"], status: "idea", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
        { id: 4, type: "Reel", hook: "I spent $50 at the grocery store. Here's everything I got.", caption: "Budget grocery haul + 5 meals I'll make this week #budgetfood", tags: ["food", "budget", "haul"], status: "uploaded_raw", notes: "Cut intro, add trending audio", thread: [{ from: "agency", text: "Great footage! Can you trim the first 5 seconds?", time: "2h ago" }, { from: "creator", text: "On it! Will re-upload by tonight", time: "1h ago" }], uploadedFileName: "grocery_haul.mp4", uploadedAt: "2024-06-01T10:00:00Z" },
        { id: 5, type: "Reel", hook: "Honest review: drugstore vs high-end blush", caption: "Swatches, wear test 🌸 #blushreview #makeupdupes", tags: ["makeup", "review"], status: "published", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
        { id: 6, type: "Post", hook: "A day in my life as a single mom trying to stay consistent", caption: "Real, raw, and unfiltered ❤️ #singlemom #lifestyle", tags: ["lifestyle", "momlife"], status: "idea", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
      ],
    },
    {
      id: "client-2",
      name: "Tara K.",
      handle: "@taralifestyle",
      niche: "Lifestyle & Home",
      avatar: "T",
      color: "#7c3aed",
      ideas: [
        { id: 10, type: "Reel", hook: "I decluttered my entire apartment in one weekend", caption: "Before & after + everything I donated 🏠 #declutter #minimalist", tags: ["home", "lifestyle"], status: "idea", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
        { id: 11, type: "Post", hook: "My $200 apartment refresh from Target & TJ Maxx", caption: "Big impact, small budget 🛒 #homedecor #budgetdecor", tags: ["home", "budget"], status: "filming", notes: "", thread: [], uploadedFileName: null, uploadedAt: null },
      ],
    },
  ],
};

// ─────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveState(state) {
  try {
    const s = {
      ...state,
      clients: state.clients.map(c => ({
        ...c,
        ideas: c.ideas.map(i => ({ ...i, uploadedDataUrl: undefined })),
      })),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {}
}

// ─────────────────────────────────────────────
// SMALL COMPONENTS
// ─────────────────────────────────────────────

const hp = "#ff0066";
const hpBg = "#fff0f6";
const border = "#f0d0dc";

function Pill({ status }) {
  const cfg = STATUS_COLORS[status];
  const lbl = STATUS_CONFIG[status];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}30`,
      borderRadius: 20, padding: "3px 10px",
      fontSize: 11, fontWeight: 700, whiteSpace: "nowrap",
    }}>
      {lbl.emoji} {lbl.label}
    </span>
  );
}

function Avatar({ letter, color, size = 40 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: color + "20", color: color,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 800, fontSize: size * 0.4, flexShrink: 0,
      border: `2px solid ${color}40`,
    }}>{letter}</div>
  );
}

function Btn({ onClick, children, variant = "primary", small, style: extra }) {
  const base = {
    border: "none", borderRadius: 10, fontWeight: 700,
    padding: small ? "6px 14px" : "10px 20px",
    fontSize: small ? 12 : 14, cursor: "pointer",
    transition: "all 0.15s", ...extra,
  };
  const variants = {
    primary: { background: hp, color: "#fff" },
    outline: { background: "transparent", color: hp, border: `1.5px solid ${hp}` },
    ghost:   { background: "transparent", color: "#6b6b6b", border: `1px solid #e8e8e8` },
    danger:  { background: "transparent", color: "#dc2626", border: `1px solid #fca5a5` },
  };
  return <button onClick={onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

const labelSt = {
  fontSize: 10, fontWeight: 800, color: "#999",
  textTransform: "uppercase", letterSpacing: 0.8,
  display: "block", marginBottom: 6,
};

const inputSt = {
  width: "100%", background: "#fff",
  border: `1.5px solid ${border}`,
  borderRadius: 10, padding: "9px 12px",
  color: "#0a0a0a", fontSize: 13,
  outline: "none", resize: "vertical",
  boxSizing: "border-box",
};

// ─────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────

function LoginScreen({ clients, onLogin }) {
  const [role, setRole] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg, #fff0f6 0%, #fce8f0 100%)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
        {/* Logo */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 40, fontWeight: 400, color: hp, letterSpacing: -1 }}>✦ FilmIt</div>
          <div style={{ fontSize: 14, color: "#999", marginTop: 4 }}>Content workflow for creators & agencies</div>
        </div>

        <div style={{ background: "#fff", borderRadius: 20, padding: 28, boxShadow: "0 4px 32px rgba(255,0,102,0.10)", border: `1px solid ${border}` }}>
          {!role ? (
            <>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#0a0a0a", marginBottom: 20 }}>Sign in as...</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button onClick={() => onLogin("agency", null)} style={{
                  padding: "16px 20px", borderRadius: 14, border: `2px solid ${border}`,
                  background: hpBg, cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = hp}
                  onMouseLeave={e => e.currentTarget.style.borderColor = border}
                >
                  <div style={{ fontWeight: 800, color: "#0a0a0a", fontSize: 15 }}>🏢 Agency / Manager</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>View all clients, manage ideas & review uploads</div>
                </button>
                <button onClick={() => setRole("creator")} style={{
                  padding: "16px 20px", borderRadius: 14, border: `2px solid ${border}`,
                  background: "#fff", cursor: "pointer", textAlign: "left",
                  transition: "all 0.15s",
                }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = hp}
                  onMouseLeave={e => e.currentTarget.style.borderColor = border}
                >
                  <div style={{ fontWeight: 800, color: "#0a0a0a", fontSize: 15 }}>🎬 Creator</div>
                  <div style={{ fontSize: 12, color: "#999", marginTop: 3 }}>View your ideas, film content & upload files</div>
                </button>
              </div>
            </>
          ) : (
            <>
              <button onClick={() => setRole(null)} style={{ background: "none", border: "none", color: "#999", fontSize: 13, marginBottom: 16, cursor: "pointer" }}>← Back</button>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#0a0a0a", marginBottom: 16 }}>Which creator are you?</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {clients.map(c => (
                  <button key={c.id} onClick={() => onLogin("creator", c.id)} style={{
                    padding: "14px 16px", borderRadius: 14,
                    border: `2px solid ${selectedClient === c.id ? c.color : border}`,
                    background: selectedClient === c.id ? c.color + "10" : "#fff",
                    cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12,
                    transition: "all 0.15s",
                  }}>
                    <Avatar letter={c.avatar} color={c.color} size={36} />
                    <div>
                      <div style={{ fontWeight: 700, color: "#0a0a0a", fontSize: 14 }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#999" }}>{c.handle} · {c.niche}</div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div style={{ marginTop: 16, fontSize: 12, color: "#bbb" }}>Demo mode — no password required</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AGENCY DASHBOARD
// ─────────────────────────────────────────────

function AgencyDashboard({ clients, onSelectClient, onAddClient, onLogout }) {
  const totalIdeas = clients.reduce((a, c) => a + c.ideas.length, 0);
  const needsEdit = clients.reduce((a, c) => a + c.ideas.filter(i => i.status === "uploaded_raw").length, 0);
  const filming = clients.reduce((a, c) => a + c.ideas.filter(i => i.status === "filming").length, 0);
  const published = clients.reduce((a, c) => a + c.ideas.filter(i => i.status === "published").length, 0);

  return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 24, color: hp }}>✦ FilmIt</div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 13, color: "#999" }}>Agency View</span>
          <Btn variant="ghost" small onClick={onLogout}>Sign out</Btn>
        </div>
      </header>

      <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
          {[
            { label: "Total Ideas", value: totalIdeas, emoji: "💡" },
            { label: "Filming Now", value: filming, emoji: "🎬" },
            { label: "Needs Editing", value: needsEdit, emoji: "📤" },
            { label: "Published", value: published, emoji: "🚀" },
          ].map(s => (
            <div key={s.label} style={{ background: "#fff", borderRadius: 16, padding: "18px 20px", border: `1px solid ${border}`, boxShadow: "0 2px 12px rgba(255,0,102,0.05)" }}>
              <div style={{ fontSize: 24, marginBottom: 6 }}>{s.emoji}</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: hp }}>{s.value}</div>
              <div style={{ fontSize: 12, color: "#999", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Clients */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <div style={{ fontFamily: "Georgia, serif", fontSize: 22, color: "#0a0a0a" }}>Your Clients</div>
          <Btn onClick={onAddClient} small>+ Add Client</Btn>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {clients.map(client => {
            const counts = Object.keys(STATUS_CONFIG).reduce((a, k) => { a[k] = client.ideas.filter(i => i.status === k).length; return a; }, {});
            const hasUrgent = counts.uploaded_raw > 0;
            return (
              <div
                key={client.id}
                onClick={() => onSelectClient(client.id)}
                style={{
                  background: "#fff", borderRadius: 18,
                  border: `1.5px solid ${hasUrgent ? hp + "60" : border}`,
                  padding: "20px 24px", cursor: "pointer",
                  boxShadow: hasUrgent ? "0 4px 20px rgba(255,0,102,0.10)" : "0 2px 12px rgba(255,0,102,0.04)",
                  transition: "all 0.2s",
                  display: "flex", alignItems: "center", gap: 18,
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = hp; e.currentTarget.style.transform = "translateY(-2px)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = hasUrgent ? hp + "60" : border; e.currentTarget.style.transform = "translateY(0)"; }}
              >
                <Avatar letter={client.avatar} color={client.color} size={52} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                    <div style={{ fontWeight: 800, fontSize: 16, color: "#0a0a0a" }}>{client.name}</div>
                    <div style={{ fontSize: 12, color: "#999" }}>{client.handle}</div>
                    {hasUrgent && <span style={{ background: hpBg, color: hp, borderRadius: 20, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>⚡ {counts.uploaded_raw} needs edit</span>}
                  </div>
                  <div style={{ fontSize: 13, color: "#999", marginBottom: 10 }}>{client.niche}</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {Object.entries(counts).filter(([, v]) => v > 0).map(([k, v]) => (
                      <span key={k} style={{
                        background: STATUS_COLORS[k].bg, color: STATUS_COLORS[k].color,
                        borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 600,
                      }}>{STATUS_CONFIG[k].emoji} {v} {STATUS_CONFIG[k].label}</span>
                    ))}
                  </div>
                </div>
                <div style={{ color: "#ccc", fontSize: 20 }}>→</div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// ADD CLIENT MODAL
// ─────────────────────────────────────────────

function AddClientModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name: "", handle: "", niche: "", color: "#ff0066" });
  const colors = ["#ff0066", "#7c3aed", "#0ea5e9", "#16a34a", "#ea580c", "#b45309"];

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    onAdd({
      id: "client-" + Date.now(),
      name: form.name,
      handle: form.handle || "@" + form.name.toLowerCase().replace(/\s/g, ""),
      niche: form.niche,
      avatar: form.name[0].toUpperCase(),
      color: form.color,
      ideas: [],
    });
    onClose();
  };

  return (
    <Modal onClose={onClose} title="Add New Client">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelSt}>Creator Name *</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jessica M." style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Handle</label>
          <input value={form.handle} onChange={e => setForm(f => ({ ...f, handle: e.target.value }))} placeholder="@jessbudgetfit" style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Niche</label>
          <input value={form.niche} onChange={e => setForm(f => ({ ...f, niche: e.target.value }))} placeholder="Budget Fitness & Beauty" style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Color</label>
          <div style={{ display: "flex", gap: 8 }}>
            {colors.map(c => (
              <button key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{
                width: 32, height: 32, borderRadius: "50%", background: c,
                border: form.color === c ? `3px solid #0a0a0a` : "3px solid transparent",
                cursor: "pointer",
              }} />
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={handleSubmit} style={{ flex: 2 }}>+ Add Client</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// MODAL WRAPPER
// ─────────────────────────────────────────────

function Modal({ onClose, title, children }) {
  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#fff", borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto",
        boxShadow: "0 8px 48px rgba(255,0,102,0.15)",
      }}>
        <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#0a0a0a", marginBottom: 20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// THREAD (chat)
// ─────────────────────────────────────────────

function Thread({ thread, onSend, role }) {
  const [msg, setMsg] = useState("");
  const bottomRef = useRef();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread]);

  const handleSend = () => {
    if (!msg.trim()) return;
    onSend(msg.trim());
    setMsg("");
  };

  return (
    <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
      <label style={labelSt}>Notes Thread</label>
      <div style={{
        background: "#fdf6f8", border: `1.5px solid ${border}`,
        borderRadius: 12, overflow: "hidden",
      }}>
        {/* Messages */}
        <div style={{ maxHeight: 180, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
          {thread.length === 0 && (
            <div style={{ fontSize: 12, color: "#ccc", textAlign: "center", padding: "12px 0" }}>No messages yet</div>
          )}
          {thread.map((m, i) => {
            const isMe = m.from === role;
            return (
              <div key={i} style={{ display: "flex", justifyContent: isMe ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "80%",
                  background: isMe ? hp : "#fff",
                  color: isMe ? "#fff" : "#0a0a0a",
                  borderRadius: isMe ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                  padding: "8px 12px", fontSize: 13,
                  border: isMe ? "none" : `1px solid ${border}`,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}>
                  <div style={{ fontSize: 10, fontWeight: 700, opacity: 0.6, marginBottom: 3 }}>
                    {m.from === "agency" ? "🏢 Agency" : "🎬 Creator"} · {m.time}
                  </div>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        {/* Input */}
        <div style={{ borderTop: `1px solid ${border}`, display: "flex", gap: 0 }}>
          <input
            value={msg}
            onChange={e => setMsg(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSend()}
            placeholder="Add a note..."
            style={{ flex: 1, border: "none", padding: "10px 14px", fontSize: 13, outline: "none", background: "transparent" }}
          />
          <button onClick={handleSend} style={{
            background: hp, color: "#fff", border: "none",
            padding: "10px 16px", fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// UPLOAD ZONE
// ─────────────────────────────────────────────

function UploadZone({ idea, onUpload }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => onUpload(idea.id, { name: file.name, size: file.size, type: file.type, dataUrl: e.target.result });
    reader.readAsDataURL(file);
  }, [idea.id, onUpload]);

  if (idea.uploadedFileName) {
    const isVideo = idea.uploadedFileType?.startsWith("video/");
    const isImage = idea.uploadedFileType?.startsWith("image/");
    const sizeMB = idea.uploadedFileSize ? (idea.uploadedFileSize / 1024 / 1024).toFixed(1) : "?";

    return (
      <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
        <label style={labelSt}>Uploaded File</label>
        <div style={{ background: "#f0fdf4", border: "1.5px solid #86efac", borderRadius: 12, overflow: "hidden" }}>
          {isVideo && idea.uploadedDataUrl && <video src={idea.uploadedDataUrl} controls style={{ width: "100%", maxHeight: 200, display: "block", background: "#000" }} />}
          {isImage && idea.uploadedDataUrl && <img src={idea.uploadedDataUrl} alt="preview" style={{ width: "100%", maxHeight: 200, objectFit: "cover", display: "block" }} />}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: "#0a0a0a", fontWeight: 600 }}>🎥 {idea.uploadedFileName}</div>
              <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{sizeMB} MB</div>
            </div>
            <Btn variant="danger" small onClick={e => { e.stopPropagation(); onUpload(idea.id, null); }}>Remove</Btn>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
      <label style={labelSt}>Upload File</label>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? hp : border}`,
          borderRadius: 12, padding: "20px", textAlign: "center",
          cursor: "pointer", background: dragging ? hpBg : "#fdf6f8",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
        <div style={{ fontSize: 13, color: "#999", fontWeight: 600 }}>Drop video or image here</div>
        <div style={{ fontSize: 11, color: "#ccc", marginTop: 3 }}>or tap to browse</div>
        <input ref={inputRef} type="file" accept="video/*,image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// IDEA CARD
// ─────────────────────────────────────────────

function IdeaCard({ idea, role, onStatusChange, onDelete, onUpload, onNoteChange, onThreadSend }) {
  const [expanded, setExpanded] = useState(false);
  const [localNote, setLocalNote] = useState(idea.notes || "");
  const isAgency = role === "agency";

  return (
    <div style={{
      background: "#fff",
      border: `1.5px solid ${idea.uploadedFileName ? "#86efac" : border}`,
      borderRadius: 16, padding: "16px 20px",
      boxShadow: "0 2px 10px rgba(255,0,102,0.04)",
      transition: "all 0.2s",
    }}>
      {/* Header row — always visible */}
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              background: idea.type === "Reel" ? "#f5f0ff" : "#f0f9ff",
              color: idea.type === "Reel" ? "#7c3aed" : "#0ea5e9",
              borderRadius: 6, padding: "2px 10px",
              fontSize: 11, fontWeight: 800, letterSpacing: 0.5, textTransform: "uppercase",
            }}>{idea.type}</span>
            <Pill status={idea.status} />
            {idea.uploadedFileName && <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 700 }}>🎥 file attached</span>}
            {idea.thread?.length > 0 && <span style={{ fontSize: 11, color: hp, fontWeight: 700 }}>💬 {idea.thread.length}</span>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#ccc" }}>{expanded ? "▲" : "▼"}</span>
            {isAgency && (
              <button onClick={e => { e.stopPropagation(); onDelete(idea.id); }} style={{ background: "none", border: "none", color: "#ddd", cursor: "pointer", fontSize: 15 }}>✕</button>
            )}
          </div>
        </div>

        <div style={{ fontFamily: "Georgia, serif", fontSize: 15, color: "#0a0a0a", lineHeight: 1.5, marginBottom: 8 }}>
          "{idea.hook}"
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {idea.tags.map(tag => (
            <span key={tag} style={{ color: tagColor(tag), fontSize: 11, fontWeight: 600 }}>#{tag}</span>
          ))}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: `1px solid ${border}`, paddingTop: 14 }}>

          {/* Caption */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Caption Draft</label>
            <div style={{ fontSize: 13, color: "#6b6b6b", lineHeight: 1.6, background: "#fdf6f8", padding: "10px 12px", borderRadius: 10 }}>
              {idea.caption}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 14 }}>
            <label style={labelSt}>Quick Notes</label>
            <textarea
              value={localNote}
              onChange={e => setLocalNote(e.target.value)}
              onBlur={() => { if (localNote !== idea.notes) onNoteChange(idea.id, localNote); }}
              onClick={e => e.stopPropagation()}
              placeholder="e.g. 'Add trending audio', 'Cut at 0:14'..."
              rows={2}
              style={inputSt}
            />
          </div>

          {/* Upload */}
          <UploadZone idea={idea} onUpload={onUpload} />

          {/* Thread */}
          <Thread thread={idea.thread || []} onSend={(text) => onThreadSend(idea.id, text)} role={role} />

          {/* Status buttons */}
          <div style={{ marginTop: 14 }}>
            <label style={labelSt}>Update Status</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) =>
                key !== idea.status && (
                  <button key={key} onClick={e => { e.stopPropagation(); onStatusChange(idea.id, key); }} style={{
                    background: STATUS_COLORS[key].bg,
                    color: STATUS_COLORS[key].color,
                    border: `1px solid ${STATUS_COLORS[key].color}40`,
                    borderRadius: 8, padding: "7px 14px",
                    fontSize: 12, fontWeight: 700, cursor: "pointer",
                  }}>
                    {cfg.emoji} {cfg.label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ADD IDEA MODAL
// ─────────────────────────────────────────────

function AddIdeaModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ type: "Reel", hook: "", caption: "", tags: "" });

  return (
    <Modal onClose={onClose} title="Add New Idea">
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <label style={labelSt}>Content Type</label>
          <div style={{ display: "flex", gap: 10 }}>
            {["Reel", "Post"].map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                flex: 1, padding: "10px", borderRadius: 10,
                border: `2px solid ${form.type === t ? hp : border}`,
                background: form.type === t ? hpBg : "#fff",
                color: form.type === t ? hp : "#999",
                fontWeight: 700, cursor: "pointer", fontSize: 14,
              }}>{t}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={labelSt}>Hook / Video Idea *</label>
          <textarea value={form.hook} onChange={e => setForm(f => ({ ...f, hook: e.target.value }))}
            placeholder='"POV: You just found a $5 dupe that slaps"' rows={3} style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Caption Draft</label>
          <textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
            placeholder="Caption + hashtags..." rows={3} style={inputSt} />
        </div>
        <div>
          <label style={labelSt}>Tags (comma-separated)</label>
          <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
            placeholder="fitness, budget, makeup" style={{ ...inputSt, resize: "none" }} />
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={() => {
            if (!form.hook.trim()) return;
            onAdd({ id: Date.now(), type: form.type, hook: form.hook, caption: form.caption, tags: form.tags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean), status: "idea", notes: "", thread: [], uploadedFileName: null, uploadedAt: null });
            onClose();
          }} style={{ flex: 2 }}>+ Add Idea</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// CLIENT BOARD (used by both agency & creator)
// ─────────────────────────────────────────────

function ClientBoard({ client, role, onBack, onUpdateClient }) {
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const ideas = client.ideas;

  const counts = Object.keys(STATUS_CONFIG).reduce((acc, k) => {
    acc[k] = ideas.filter(i => i.status === k).length;
    return acc;
  }, {});

  const filtered = ideas.filter(i => {
    if (filter !== "all" && i.status !== filter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (search && !i.hook.toLowerCase().includes(search.toLowerCase()) && !i.tags.some(t => t.includes(search.toLowerCase()))) return false;
    return true;
  });

  const updateIdeas = (updater) => {
    onUpdateClient({ ...client, ideas: updater(client.ideas) });
  };

  const handleStatusChange = (id, status) => updateIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i));
  const handleDelete = (id) => updateIdeas(prev => prev.filter(i => i.id !== id));
  const handleNoteChange = (id, notes) => updateIdeas(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
  const handleUpload = useCallback((ideaId, fileObj) => {
    updateIdeas(prev => prev.map(i => i.id === ideaId ? fileObj ? {
      ...i,
      uploadedFileName: fileObj.name, uploadedFileSize: fileObj.size,
      uploadedFileType: fileObj.type, uploadedDataUrl: fileObj.dataUrl,
      uploadedAt: new Date().toISOString(),
      status: (i.status === "idea" || i.status === "filming") ? "uploaded_raw" : i.status,
    } : { ...i, uploadedFileName: null, uploadedFileSize: null, uploadedFileType: null, uploadedDataUrl: null, uploadedAt: null } : i));
  }, [client]);

  const handleThreadSend = (ideaId, text) => {
    updateIdeas(prev => prev.map(i => i.id === ideaId ? {
      ...i,
      thread: [...(i.thread || []), { from: role, text, time: "just now" }],
    } : i));
  };

  const handleAddIdea = (idea) => updateIdeas(prev => [idea, ...prev]);

  return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8" }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "14px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        {role === "agency" && (
          <button onClick={onBack} style={{ background: "none", border: "none", color: hp, fontWeight: 700, fontSize: 14, cursor: "pointer" }}>← All Clients</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
          <Avatar letter={client.avatar} color={client.color} size={38} />
          <div>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#0a0a0a" }}>{client.name}</div>
            <div style={{ fontSize: 12, color: "#999" }}>{client.handle} · {client.niche}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {role === "agency" && <Btn small onClick={() => setShowAdd(true)}>+ Add Idea</Btn>}
          <span style={{
            background: role === "agency" ? hpBg : "#f0fdf4",
            color: role === "agency" ? hp : "#16a34a",
            borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700,
          }}>{role === "agency" ? "🏢 Agency" : "🎬 Creator"}</span>
        </div>
      </header>

      {/* Filters */}
      <div style={{ background: "#fff", borderBottom: `1px solid ${border}`, padding: "12px 24px" }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 8, marginBottom: 10 }}>
            {[["all", "All", ideas.length], ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, `${v.emoji} ${v.label}`, counts[k] || 0])].map(([key, label, count]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                background: filter === key ? (key === "all" ? "#0a0a0a" : STATUS_COLORS[key]?.bg) : "transparent",
                border: `1.5px solid ${filter === key ? (key === "all" ? "#0a0a0a" : STATUS_COLORS[key]?.color + "60") : border}`,
                color: filter === key ? (key === "all" ? "#fff" : STATUS_COLORS[key]?.color) : "#999",
                borderRadius: 20, padding: "5px 14px", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>{label}{count > 0 ? ` (${count})` : ""}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ideas..."
              style={{ ...inputSt, flex: 1, padding: "8px 14px" }} />
            {["all", "Reel", "Post"].map(t => (
              <button key={t} onClick={() => setTypeFilter(t)} style={{
                padding: "8px 14px", borderRadius: 10,
                border: `1.5px solid ${typeFilter === t ? hp : border}`,
                background: typeFilter === t ? hpBg : "#fff",
                color: typeFilter === t ? hp : "#999",
                cursor: "pointer", fontWeight: 700, fontSize: 13,
              }}>{t === "all" ? "All" : t}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Cards */}
      <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#ccc" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: 20, color: "#999" }}>No ideas here</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Try a different filter{role === "agency" ? " or add new ideas" : ""}</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                role={role}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onUpload={handleUpload}
                onNoteChange={handleNoteChange}
                onThreadSend={handleThreadSend}
              />
            ))}
          </div>
        )}
      </main>

      {showAdd && <AddIdeaModal onAdd={handleAddIdea} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────

export default function FilmIt() {
  const [state, setState] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("login"); // login | dashboard | board
  const [activeClientId, setActiveClientId] = useState(null);
  const [showAddClient, setShowAddClient] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");

  useEffect(() => {
    const stored = loadState();
    setState(stored || { ...SEED_DATA, role: null });
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded || !state) return;
    setSaveStatus("saving");
    const t = setTimeout(() => { saveState(state); setSaveStatus("saved"); }, 800);
    return () => clearTimeout(t);
  }, [state, loaded]);

  if (!loaded || !state) return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc" }}>
      Loading FilmIt...
    </div>
  );

  const handleLogin = (role, clientId) => {
    setState(s => ({ ...s, role }));
    if (role === "agency") {
      setView("dashboard");
    } else {
      setActiveClientId(clientId);
      setView("board");
    }
  };

  const handleLogout = () => {
    setState(s => ({ ...s, role: null }));
    setView("login");
    setActiveClientId(null);
  };

  const handleUpdateClient = (updatedClient) => {
    setState(s => ({ ...s, clients: s.clients.map(c => c.id === updatedClient.id ? updatedClient : c) }));
  };

  const handleAddClient = (client) => {
    setState(s => ({ ...s, clients: [...s.clients, client] }));
  };

  const activeClient = state.clients.find(c => c.id === activeClientId);

  if (view === "login") {
    return <LoginScreen clients={state.clients} onLogin={handleLogin} />;
  }

  if (view === "dashboard" && state.role === "agency") {
    return (
      <>
        <AgencyDashboard
          clients={state.clients}
          onSelectClient={(id) => { setActiveClientId(id); setView("board"); }}
          onAddClient={() => setShowAddClient(true)}
          onLogout={handleLogout}
        />
        {showAddClient && <AddClientModal onAdd={handleAddClient} onClose={() => setShowAddClient(false)} />}
      </>
    );
  }

  if (view === "board" && activeClient) {
    return (
      <ClientBoard
        client={activeClient}
        role={state.role}
        onBack={() => setView("dashboard")}
        onUpdateClient={handleUpdateClient}
        onLogout={handleLogout}
      />
    );
  }

  return <LoginScreen clients={state.clients} onLogin={handleLogin} />;
}
