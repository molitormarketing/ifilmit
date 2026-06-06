"use client";

import { useState, useEffect, useRef, useCallback } from "react";

// ── Data ─────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "filmit-ideas";

const SAMPLE_IDEAS = [
  { id: 1, type: "Reel", hook: "POV: You just found out you can eat this for $3", caption: "Budget breakfast that actually slaps 👏 #budgetfitness #mealprep", tags: ["fitness", "budget", "food"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 2, type: "Reel", hook: "The $12 makeup dupe that replaced my $60 foundation", caption: "I tested it for 2 weeks. Here's the verdict 👀 #makeupdupes #budgetbeauty", tags: ["makeup", "dupes", "budget"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 3, type: "Post", hook: "My full-body workout with zero equipment (and a baby on my hip)", caption: "No gym needed. No excuses needed. Just you 💪 #momlife #homeworkout", tags: ["fitness", "momlife"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 4, type: "Reel", hook: "I spent $50 at the grocery store. Here's everything I got.", caption: "Budget grocery haul + 5 meals I'll make this week #budgetfood #mealplan", tags: ["food", "budget", "haul"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 5, type: "Reel", hook: "Honest review: drugstore vs high-end blush", caption: "Swatches, wear test, and a verdict you might not expect 🌸 #blushreview #makeupdupes", tags: ["makeup", "review"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 6, type: "Post", hook: "A day in my life as a single mom trying to stay consistent", caption: "Real, raw, and unfiltered ❤️ #singlemom #consistency #lifestyle", tags: ["lifestyle", "momlife"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 7, type: "Reel", hook: "Get unready with me after a long day", caption: "Skincare routine under $30 total 🧴 #grwm #budgetskincare #selfcare", tags: ["skincare", "budget", "routine"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 8, type: "Reel", hook: "5 Walmart finds that look way more expensive than they are", caption: "Affordable doesn't have to mean cheap 🛒 #walmartfinds #budgetstyle", tags: ["lifestyle", "budget", "shopping"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 9, type: "Post", hook: "Weekly workout split for busy moms", caption: "4 days, 30 min each. Screenshot this 📸 #workoutplan #fitnessmom", tags: ["fitness", "routine"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 10, type: "Reel", hook: "Watch me transform this $5 foundation with a $2 setting powder", caption: "Drugstore girlies, this one's for you 💄 #makeuptips #budgetmakeup", tags: ["makeup", "budget", "tutorial"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 11, type: "Reel", hook: "What I actually eat in a week on a tight budget", caption: "No diet culture. Just real food. #whatieatinaweek #budgeteating", tags: ["food", "budget"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
  { id: 12, type: "Reel", hook: "The ab workout I did postpartum to feel strong again", caption: "Safe, simple, effective 💪 #postpartumfitness #coreworkout #momlife", tags: ["fitness", "momlife", "postpartum"], status: "idea", notes: "", uploadedFileName: null, uploadedAt: null },
];

const STATUS_CONFIG = {
  idea:           { label: "Idea",                  color: "#a78bfa", bg: "#1e1b4b", emoji: "💡" },
  filming:        { label: "Filming",               color: "#fb923c", bg: "#431407", emoji: "🎬" },
  uploaded_raw:   { label: "Uploaded — Needs Edit", color: "#facc15", bg: "#422006", emoji: "📤" },
  uploaded_edited:{ label: "Uploaded — Edited",     color: "#4ade80", bg: "#052e16", emoji: "✂️" },
  published:      { label: "Published ✓",           color: "#38bdf8", bg: "#0c1a2e", emoji: "🚀" },
};

const TYPE_COLORS = {
  Reel: { bg: "#7c3aed", text: "#fff" },
  Post: { bg: "#0ea5e9", text: "#fff" },
};

const TAG_PALETTE = ["#a78bfa", "#fb923c", "#4ade80", "#f472b6", "#38bdf8", "#facc15"];
const tagColor = (tag) => TAG_PALETTE[tag.charCodeAt(0) % TAG_PALETTE.length];

const formatDate = (iso) => {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
};

const fileIcon = (name) => {
  if (!name) return "📎";
  const ext = name.split(".").pop().toLowerCase();
  if (["mp4", "mov", "avi", "webm", "mkv"].includes(ext)) return "🎥";
  if (["jpg", "jpeg", "png", "gif", "webp", "heic"].includes(ext)) return "🖼️";
  return "📎";
};

// ── Storage ──────────────────────────────────────────────────────────────────

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveToStorage(ideas) {
  try {
    // Don't persist large dataUrls — store metadata only
    const saveable = ideas.map(i => ({ ...i, uploadedDataUrl: undefined }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saveable));
  } catch { /* quota exceeded — silently ignore */ }
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span style={{
      background: cfg.bg, color: cfg.color,
      border: `1px solid ${cfg.color}40`,
      borderRadius: 6, padding: "3px 10px",
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5, whiteSpace: "nowrap",
    }}>
      {cfg.emoji} {cfg.label}
    </span>
  );
}

function UploadZone({ idea, onUpload }) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef();

  const handleFile = useCallback((file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      onUpload(idea.id, {
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: e.target.result,
      });
    };
    reader.readAsDataURL(file);
  }, [idea.id, onUpload]);

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  if (idea.uploadedFileName) {
    const isVideo = idea.uploadedFileType?.startsWith("video/");
    const isImage = idea.uploadedFileType?.startsWith("image/");
    const sizeMB = idea.uploadedFileSize ? (idea.uploadedFileSize / 1024 / 1024).toFixed(1) : "?";

    return (
      <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
        <div style={labelStyle}>Uploaded File</div>
        <div style={{ background: "#0f0f1a", border: "1px solid #2a4a2a", borderRadius: 12, overflow: "hidden" }}>
          {isVideo && idea.uploadedDataUrl && (
            <video src={idea.uploadedDataUrl} controls style={{ width: "100%", maxHeight: 220, display: "block", background: "#000" }} />
          )}
          {isImage && idea.uploadedDataUrl && (
            <img src={idea.uploadedDataUrl} alt="preview" style={{ width: "100%", maxHeight: 220, objectFit: "cover", display: "block" }} />
          )}
          {!isVideo && !isImage && (
            <div style={{ padding: 20, textAlign: "center", fontSize: 32 }}>{fileIcon(idea.uploadedFileName)}</div>
          )}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <div>
              <div style={{ fontSize: 13, color: "#c0c0e0", fontWeight: 600, wordBreak: "break-all" }}>
                {fileIcon(idea.uploadedFileName)} {idea.uploadedFileName}
              </div>
              <div style={{ fontSize: 11, color: "#5050a0", marginTop: 2 }}>{sizeMB} MB</div>
            </div>
            <button
              onClick={e => { e.stopPropagation(); onUpload(idea.id, null); }}
              style={{ background: "#2a1010", border: "1px solid #5a2020", color: "#f87171", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}
            >Remove</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }} onClick={e => e.stopPropagation()}>
      <div style={labelStyle}>Upload File</div>
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#7c3aed" : "#2a2a5a"}`,
          borderRadius: 12, padding: "22px 16px", textAlign: "center",
          cursor: "pointer", background: dragging ? "#1a1a3a" : "#0f0f1a",
          transition: "all 0.2s",
        }}
      >
        <div style={{ fontSize: 26, marginBottom: 8 }}>📁</div>
        <div style={{ fontSize: 13, color: "#7070a0", fontWeight: 600 }}>Drop video or image here</div>
        <div style={{ fontSize: 11, color: "#4a4a70", marginTop: 4 }}>or tap to browse</div>
        <input ref={inputRef} type="file" accept="video/*,image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
      </div>
    </div>
  );
}

const labelStyle = {
  fontSize: 10, fontWeight: 700, color: "#6060a0",
  textTransform: "uppercase", letterSpacing: 0.8,
  display: "block", marginBottom: 6,
};

function IdeaCard({ idea, onStatusChange, onDelete, onUpload, onNoteChange, isCreatorMode }) {
  const [expanded, setExpanded] = useState(false);
  const [localNote, setLocalNote] = useState(idea.notes || "");

  return (
    <div style={{
      background: "linear-gradient(135deg, #161622 0%, #1a1a2e 100%)",
      border: `1px solid ${idea.uploadedFileName ? "#2a4a2a" : "#2a2a4a"}`,
      borderRadius: 16, padding: "18px 20px",
      transition: "border-color 0.2s",
    }}>
      {/* Clickable header */}
      <div onClick={() => setExpanded(!expanded)} style={{ cursor: "pointer" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{
              background: TYPE_COLORS[idea.type].bg, color: TYPE_COLORS[idea.type].text,
              borderRadius: 6, padding: "2px 10px", fontSize: 11,
              fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
            }}>{idea.type}</span>
            <StatusBadge status={idea.status} />
            {idea.uploadedFileName && (
              <span style={{ fontSize: 11, color: "#4ade80", fontWeight: 700 }}>
                {fileIcon(idea.uploadedFileName)} attached
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 12, color: "#4a4a7a" }}>{expanded ? "▲" : "▼"}</span>
            {!isCreatorMode && (
              <button
                onClick={e => { e.stopPropagation(); onDelete(idea.id); }}
                style={{ background: "none", border: "none", color: "#4a4a7a", cursor: "pointer", fontSize: 16, padding: "0 4px" }}
              >✕</button>
            )}
          </div>
        </div>

        <div style={{ fontFamily: "var(--font-dm-serif), serif", fontSize: 16, color: "#e8e8ff", lineHeight: 1.4, marginBottom: 8 }}>
          "{idea.hook}"
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {idea.tags.map(tag => (
            <span key={tag} style={{ color: tagColor(tag), fontSize: 11, fontWeight: 600, opacity: 0.8 }}>#{tag}</span>
          ))}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div style={{ marginTop: 14, borderTop: "1px solid #2a2a4a", paddingTop: 14 }}>

          <div style={{ fontSize: 13, color: "#9090b0", lineHeight: 1.6, marginBottom: 14 }}>
            <span style={labelStyle}>Caption Draft</span>
            {idea.caption}
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Notes / Handoff Notes</label>
            <textarea
              value={localNote}
              onChange={e => setLocalNote(e.target.value)}
              onBlur={() => { if (localNote !== idea.notes) onNoteChange(idea.id, localNote); }}
              onClick={e => e.stopPropagation()}
              placeholder="e.g. 'Add trending audio', 'Cut at 0:14', 'Use b-roll from kitchen clip'..."
              rows={2}
              style={{
                width: "100%", background: "#0f0f1a", border: "1px solid #2a2a4a",
                borderRadius: 10, padding: "9px 12px", color: "#e8e8ff",
                fontSize: 13, resize: "vertical", outline: "none",
              }}
            />
          </div>

          <UploadZone idea={idea} onUpload={onUpload} />

          <div style={{ marginTop: 14 }}>
            <div style={labelStyle}>Update Status</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {Object.entries(STATUS_CONFIG).map(([key, cfg]) =>
                key !== idea.status && (
                  <button
                    key={key}
                    onClick={e => { e.stopPropagation(); onStatusChange(idea.id, key); }}
                    style={{
                      background: cfg.bg, color: cfg.color,
                      border: `1px solid ${cfg.color}50`,
                      borderRadius: 8, padding: "7px 14px",
                      fontSize: 12, fontWeight: 700, cursor: "pointer",
                    }}
                  >
                    {cfg.emoji} {cfg.label}
                  </button>
                )
              )}
            </div>
          </div>

          {idea.uploadedAt && (
            <div style={{ marginTop: 10, fontSize: 11, color: "#3a3a6a" }}>
              Uploaded {formatDate(idea.uploadedAt)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AddIdeaModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ type: "Reel", hook: "", caption: "", tags: "" });

  const handleSubmit = () => {
    if (!form.hook.trim()) return;
    onAdd({
      id: Date.now(),
      type: form.type,
      hook: form.hook.trim(),
      caption: form.caption.trim(),
      tags: form.tags.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean),
      status: "idea",
      notes: "",
      uploadedFileName: null,
      uploadedAt: null,
    });
    onClose();
  };

  const iStyle = {
    width: "100%", background: "#0f0f1a", border: "1px solid #2a2a4a",
    borderRadius: 10, padding: "10px 14px", color: "#e8e8ff",
    fontSize: 14, outline: "none", resize: "vertical",
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", zIndex: 100,
      display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "#161622", border: "1px solid #3a3a6a",
        borderRadius: 20, padding: 28,
        width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ fontFamily: "var(--font-dm-serif), serif", fontSize: 22, color: "#e8e8ff", marginBottom: 20 }}>
          Add New Idea
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          <div>
            <label style={labelStyle}>Content Type</label>
            <div style={{ display: "flex", gap: 10 }}>
              {["Reel", "Post"].map(t => (
                <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))} style={{
                  flex: 1, padding: 10, borderRadius: 10,
                  border: `2px solid ${form.type === t ? TYPE_COLORS[t].bg : "#2a2a4a"}`,
                  background: form.type === t ? TYPE_COLORS[t].bg + "30" : "transparent",
                  color: form.type === t ? TYPE_COLORS[t].bg : "#6060a0",
                  fontWeight: 700, cursor: "pointer", fontSize: 14,
                }}>{t}</button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Hook / Video Idea *</label>
            <textarea value={form.hook} onChange={e => setForm(f => ({ ...f, hook: e.target.value }))}
              placeholder='"POV: You just found a $5 dupe that slaps"'
              rows={3} style={iStyle} />
          </div>

          <div>
            <label style={labelStyle}>Caption Draft</label>
            <textarea value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
              placeholder="Caption + hashtags..." rows={3} style={iStyle} />
          </div>

          <div>
            <label style={labelStyle}>Tags (comma-separated)</label>
            <input value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
              placeholder="fitness, budget, makeup" style={{ ...iStyle, resize: "none" }} />
          </div>

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onClose} style={{
              flex: 1, padding: 12, borderRadius: 10, border: "1px solid #2a2a4a",
              background: "transparent", color: "#6060a0", cursor: "pointer", fontWeight: 700, fontSize: 14,
            }}>Cancel</button>
            <button onClick={handleSubmit} style={{
              flex: 2, padding: 12, borderRadius: 10, border: "none",
              background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
              color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14,
            }}>+ Add Idea</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────

export default function ContentHub() {
  const [ideas, setIdeas] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [isCreatorMode, setIsCreatorMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState("saved");

  useEffect(() => {
    const stored = loadFromStorage();
    setIdeas(stored || SAMPLE_IDEAS);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setSaveStatus("saving");
    const t = setTimeout(() => {
      saveToStorage(ideas);
      setSaveStatus("saved");
    }, 800);
    return () => clearTimeout(t);
  }, [ideas, loaded]);

  const handleStatusChange = (id, status) =>
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i));

  const handleDelete = (id) =>
    setIdeas(prev => prev.filter(i => i.id !== id));

  const handleAdd = (idea) =>
    setIdeas(prev => [idea, ...prev]);

  const handleUpload = useCallback((ideaId, fileObj) => {
    if (fileObj) {
      setIdeas(prev => prev.map(i =>
        i.id === ideaId ? {
          ...i,
          uploadedFileName: fileObj.name,
          uploadedFileSize: fileObj.size,
          uploadedFileType: fileObj.type,
          uploadedDataUrl: fileObj.dataUrl,
          uploadedAt: new Date().toISOString(),
          status: (i.status === "idea" || i.status === "filming") ? "uploaded_raw" : i.status,
        } : i
      ));
    } else {
      setIdeas(prev => prev.map(i =>
        i.id === ideaId ? { ...i, uploadedFileName: null, uploadedFileSize: null, uploadedFileType: null, uploadedDataUrl: null, uploadedAt: null } : i
      ));
    }
  }, []);

  const handleNoteChange = (id, notes) =>
    setIdeas(prev => prev.map(i => i.id === id ? { ...i, notes } : i));

  const filtered = ideas.filter(i => {
    if (filter !== "all" && i.status !== filter) return false;
    if (typeFilter !== "all" && i.type !== typeFilter) return false;
    if (search && !i.hook.toLowerCase().includes(search.toLowerCase()) && !i.tags.some(t => t.includes(search.toLowerCase()))) return false;
    return true;
  });

  const counts = Object.keys(STATUS_CONFIG).reduce((acc, k) => {
    acc[k] = ideas.filter(i => i.status === k).length;
    return acc;
  }, {});

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#0a0a14", display: "flex", alignItems: "center", justifyContent: "center", color: "#5050a0" }}>
      Loading FilmIt...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a14", color: "#e8e8ff" }}>

      {/* Sticky header */}
      <header style={{
        background: "linear-gradient(180deg, #0f0f1f 0%, #0a0a14 100%)",
        borderBottom: "1px solid #1a1a2e",
        padding: "18px 24px",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontFamily: "var(--font-dm-serif), serif", fontSize: 26, lineHeight: 1.1 }}>
                ✦ FilmIt
              </div>
              <div style={{ fontSize: 12, color: "#5050a0", marginTop: 2, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <span>{ideas.length} ideas</span>
                <span>·</span>
                <span>{counts.filming || 0} filming</span>
                <span>·</span>
                <span>{counts.uploaded_raw || 0} need editing</span>
                <span>·</span>
                <span style={{ color: saveStatus === "saving" ? "#facc15" : "#3a3a6a" }}>
                  {saveStatus === "saving" ? "⟳ saving..." : "✓ saved"}
                </span>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                onClick={() => setIsCreatorMode(!isCreatorMode)}
                style={{
                  padding: "8px 16px", borderRadius: 10,
                  border: `1px solid ${isCreatorMode ? "#fb923c50" : "#2a2a4a"}`,
                  background: isCreatorMode ? "#431407" : "transparent",
                  color: isCreatorMode ? "#fb923c" : "#6060a0",
                  cursor: "pointer", fontWeight: 700, fontSize: 13,
                }}
              >
                {isCreatorMode ? "🎬 Creator Mode" : "👤 Creator Mode"}
              </button>
              {!isCreatorMode && (
                <button
                  onClick={() => setShowAdd(true)}
                  style={{
                    padding: "8px 18px", borderRadius: 10, border: "none",
                    background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    color: "#fff", cursor: "pointer", fontWeight: 800, fontSize: 14,
                  }}
                >+ Add Idea</button>
              )}
            </div>
          </div>

          {/* Status tabs */}
          <div style={{ display: "flex", gap: 7, overflowX: "auto", paddingBottom: 4, marginBottom: 12 }}>
            {[
              ["all", "All", ideas.length],
              ...Object.entries(STATUS_CONFIG).map(([k, v]) => [k, `${v.emoji} ${v.label.split("—")[0].trim()}`, counts[k] || 0])
            ].map(([key, label, count]) => (
              <button key={key} onClick={() => setFilter(key)} style={{
                background: filter === key ? (key === "all" ? "#2a2a4a" : STATUS_CONFIG[key]?.bg) : "transparent",
                border: `1px solid ${filter === key ? (key === "all" ? "#4a4a7a" : STATUS_CONFIG[key]?.color + "60") : "#1a1a3a"}`,
                color: filter === key ? (key === "all" ? "#e8e8ff" : STATUS_CONFIG[key]?.color) : "#5050a0",
                borderRadius: 8, padding: "6px 12px", cursor: "pointer",
                fontSize: 12, fontWeight: 700, whiteSpace: "nowrap",
              }}>{label}{count > 0 ? ` (${count})` : ""}</button>
            ))}
          </div>

          {/* Search + type */}
          <div style={{ display: "flex", gap: 10 }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ideas or tags..."
              style={{
                flex: 1, background: "#0f0f1a", border: "1px solid #2a2a4a",
                borderRadius: 10, padding: "9px 14px", color: "#e8e8ff",
                fontSize: 14, outline: "none",
              }}
            />
            <div style={{ display: "flex", gap: 6 }}>
              {["all", "Reel", "Post"].map(t => (
                <button key={t} onClick={() => setTypeFilter(t)} style={{
                  padding: "9px 14px", borderRadius: 10,
                  border: `1px solid ${typeFilter === t ? (t === "Reel" ? "#7c3aed" : t === "Post" ? "#0ea5e9" : "#4a4a7a") : "#1a1a3a"}`,
                  background: typeFilter === t ? (t === "Reel" ? "#7c3aed20" : t === "Post" ? "#0ea5e920" : "#2a2a4a") : "transparent",
                  color: typeFilter === t ? (t === "Reel" ? "#a78bfa" : t === "Post" ? "#38bdf8" : "#e8e8ff") : "#5050a0",
                  cursor: "pointer", fontWeight: 700, fontSize: 13,
                }}>{t === "all" ? "All" : t}</button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {isCreatorMode && (
        <div style={{
          background: "linear-gradient(90deg, #431407, #1a0a00)",
          borderBottom: "1px solid #fb923c30",
          padding: "10px 24px", textAlign: "center",
          fontSize: 13, color: "#fb923c", fontWeight: 700,
        }}>
          🎬 Creator Mode — Pick an idea, film it, and upload your file directly to the card
        </div>
      )}

      <main style={{ maxWidth: 860, margin: "0 auto", padding: "24px 20px" }}>
        {filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "#3a3a6a" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💡</div>
            <div style={{ fontFamily: "var(--font-dm-serif), serif", fontSize: 20 }}>No ideas here</div>
            <div style={{ fontSize: 14, marginTop: 6 }}>Try a different filter or add new ideas</div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map(idea => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
                onUpload={handleUpload}
                onNoteChange={handleNoteChange}
                isCreatorMode={isCreatorMode}
              />
            ))}
          </div>
        )}
      </main>

      {showAdd && <AddIdeaModal onAdd={handleAdd} onClose={() => setShowAdd(false)} />}
    </div>
  );
}
