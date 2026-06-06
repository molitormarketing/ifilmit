"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const hp = "#ff0066";
const hpBg = "#fff0f6";
const hpDark = "#cc0052";
const border = "#f0d0dc";

const STATUS_CONFIG = {
  idea:            { label: "Idea",             emoji: "💡" },
  filming:         { label: "Filming",          emoji: "🎬" },
  uploaded_raw:    { label: "Needs Editing",    emoji: "📤" },
  uploaded_edited: { label: "Edited & Ready",   emoji: "✂️"  },
  published:       { label: "Published ✓",      emoji: "🚀" },
  pending:         { label: "Pending Approval", emoji: "⏳" },
};

const STATUS_COLORS = {
  idea:            { color: "#7c3aed", bg: "#f5f0ff" },
  filming:         { color: "#ea580c", bg: "#fff7ed" },
  uploaded_raw:    { color: "#b45309", bg: "#fefce8" },
  uploaded_edited: { color: "#16a34a", bg: "#f0fdf4" },
  published:       { color: hp,        bg: hpBg      },
  pending:         { color: "#6b6b6b", bg: "#f5f5f5" },
};

const TAG_PALETTE = ["#ff0066","#7c3aed","#0ea5e9","#16a34a","#ea580c","#b45309"];
const tagColor = (t) => TAG_PALETTE[t.charCodeAt(0) % TAG_PALETTE.length];
const fmt = (iso) => iso ? new Date(iso).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}) : "";

// ─────────────────────────────────────────────
// SUPABASE DATA LAYER
// ─────────────────────────────────────────────

async function fetchClients() {
  const { data, error } = await supabase.from("clients").select("*").order("created_at");
  if (error) { console.error("fetchClients:", error); return []; }
  return data.map(c => ({
    id: c.id, name: c.name, handle: c.handle, niche: c.niche,
    avatar: c.avatar, color: c.color,
    earnings: { agencyCut: c.agency_cut||20, agencyName: c.agency_name||"Your Agency", entries:[], brandDeals:[] },
    platforms: {}, ideas: [],
  }));
}

async function fetchIdeasForClient(clientId) {
  const { data, error } = await supabase.from("ideas").select("*").eq("client_id", clientId).order("created_at");
  if (error) { console.error("fetchIdeas:", error); return []; }
  return data.map(i => ({
    id: i.id, type: i.type, hook: i.hook, caption: i.caption||"",
    tags: i.tags||[], status: i.status, notes: i.notes||"",
    isUGC: i.is_ugc, deadline: i.deadline, brief: i.brief,
    uploadedFileName: i.uploaded_file_name, uploadedAt: i.uploaded_at,
    thread: [],
  }));
}

async function fetchMessages(ideaId) {
  const { data } = await supabase.from("messages").select("*").eq("idea_id", ideaId).order("created_at");
  return (data||[]).map(m => ({ from: m.from_role, text: m.text, time: new Date(m.created_at).toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}) }));
}

async function saveClient(client) {
  const { error } = await supabase.from("clients").upsert({
    id: client.id, name: client.name, handle: client.handle,
    niche: client.niche, avatar: client.avatar, color: client.color,
    agency_cut: client.earnings?.agencyCut||20,
    agency_name: client.earnings?.agencyName||"Your Agency",
  });
  if (error) console.error("saveClient:", error);
}

async function saveIdea(idea, clientId) {
  const { error } = await supabase.from("ideas").upsert({
    id: typeof idea.id === "number" ? undefined : idea.id,
    client_id: clientId, type: idea.type, hook: idea.hook,
    caption: idea.caption, tags: idea.tags, status: idea.status,
    notes: idea.notes, is_ugc: idea.isUGC, deadline: idea.deadline||null,
    brief: idea.brief||null, uploaded_file_name: idea.uploadedFileName||null,
  });
  if (error) console.error("saveIdea:", error);
}

async function deleteIdea(ideaId) {
  await supabase.from("ideas").delete().eq("id", ideaId);
}

async function sendMessage(ideaId, fromRole, text) {
  const { data } = await supabase.from("messages").insert({ idea_id: ideaId, from_role: fromRole, text }).select().single();
  return data;
}

async function saveEarningsEntry(entry, clientId) {
  await supabase.from("earnings_entries").upsert({ id: typeof entry.id==="number"?undefined:entry.id, client_id: clientId, platform: entry.platform, amount: entry.amount, note: entry.note||"", month: entry.month });
}

async function deleteEarningsEntry(entryId) {
  await supabase.from("earnings_entries").delete().eq("id", entryId);
}

async function fetchEarningsEntries(clientId) {
  const { data } = await supabase.from("earnings_entries").select("*").eq("client_id", clientId);
  return (data||[]).map(e => ({ id: e.id, platform: e.platform, amount: e.amount, note: e.note, month: e.month }));
}

async function saveBrandDeal(deal, clientId) {
  await supabase.from("brand_deals").upsert({ id: typeof deal.id==="number"?undefined:deal.id, client_id: clientId, brand: deal.brand, amount: deal.amount, description: deal.description||"", due_date: deal.dueDate||null, paid_date: deal.paidDate||null, status: deal.status, month: deal.month||null });
}

async function deleteBrandDeal(dealId) {
  await supabase.from("brand_deals").delete().eq("id", dealId);
}

async function fetchBrandDeals(clientId) {
  const { data } = await supabase.from("brand_deals").select("*").eq("client_id", clientId);
  return (data||[]).map(d => ({ id: d.id, brand: d.brand, amount: d.amount, description: d.description, dueDate: d.due_date, paidDate: d.paid_date, status: d.status, month: d.month }));
}

async function savePlatformApp(app, clientId, platformId) {
  await supabase.from("platform_applications").upsert({ id: typeof app.id==="number"?undefined:app.id, client_id: clientId, platform_id: platformId, brand: app.brand, amount: app.amount||null, description: app.description||"", brief: app.brief||"", deadline: app.deadline||null, applied_date: app.appliedDate||null, status: app.status });
}

async function deletePlatformApp(appId) {
  await supabase.from("platform_applications").delete().eq("id", appId);
}

async function fetchPlatformApps(clientId) {
  const { data } = await supabase.from("platform_applications").select("*").eq("client_id", clientId);
  return (data||[]).map(a => ({ id: a.id, platformId: a.platform_id, brand: a.brand, amount: a.amount, description: a.description, brief: a.brief, deadline: a.deadline, appliedDate: a.applied_date, status: a.status }));
}

// ─────────────────────────────────────────────
// SHARED UI ATOMS
// ─────────────────────────────────────────────

function Pill({ status }) {
  const c = STATUS_COLORS[status]; const l = STATUS_CONFIG[status];
  return <span style={{ background:c.bg, color:c.color, border:`1px solid ${c.color}30`, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, whiteSpace:"nowrap" }}>{l.emoji} {l.label}</span>;
}

function Avatar({ letter, color, size=40 }) {
  return <div style={{ width:size, height:size, borderRadius:"50%", background:color+"20", color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:size*0.4, flexShrink:0, border:`2px solid ${color}40` }}>{letter}</div>;
}

function Btn({ onClick, children, variant="primary", small, style:x, disabled }) {
  const base = { border:"none", borderRadius:10, fontWeight:700, padding:small?"6px 14px":"10px 20px", fontSize:small?12:14, cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.5:1, transition:"all 0.15s", ...x };
  const v = { primary:{background:hp,color:"#fff"}, outline:{background:"transparent",color:hp,border:`1.5px solid ${hp}`}, ghost:{background:"transparent",color:"#6b6b6b",border:"1px solid #e8e8e8"}, danger:{background:"transparent",color:"#dc2626",border:"1px solid #fca5a5"}, purple:{background:"#7c3aed",color:"#fff"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>;
}

const labelSt = { fontSize:10, fontWeight:800, color:"#999", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 };
const inputSt = { width:"100%", background:"#fff", border:`1.5px solid ${border}`, borderRadius:10, padding:"9px 12px", color:"#0a0a0a", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box" };

// ─────────────────────────────────────────────
// STAT CARDS BAR (shown on every page)
// ─────────────────────────────────────────────

function StatBar({ ideas, extra }) {
  const counts = {
    idea: ideas.filter(i=>i.status==="idea").length,
    filming: ideas.filter(i=>i.status==="filming").length,
    uploaded_raw: ideas.filter(i=>i.status==="uploaded_raw").length,
    published: ideas.filter(i=>i.status==="published").length,
  };
  const stats = [
    { label:"Total Ideas",    value: ideas.length,          emoji:"💡" },
    { label:"Filming Now",    value: counts.filming,        emoji:"🎬" },
    { label:"Needs Editing",  value: counts.uploaded_raw,   emoji:"📤" },
    { label:"Published",      value: counts.published,      emoji:"🚀" },
    ...(extra||[]),
  ];
  return (
    <div style={{ background:"#fff", borderBottom:`1px solid ${border}`, padding:"16px 24px" }}>
      <div style={{ maxWidth:900, margin:"0 auto", display:"grid", gridTemplateColumns:`repeat(${stats.length}, 1fr)`, gap:12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background:hpBg, borderRadius:16, padding:"16px 18px", border:`1px solid ${border}`, textAlign:"center" }}>
            <div style={{ fontSize:22, marginBottom:4 }}>{s.emoji}</div>
            <div style={{ fontSize:26, fontWeight:800, color:hp, lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#999", marginTop:4 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MODAL
// ─────────────────────────────────────────────

function Modal({ onClose, title, children, wide }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.3)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#fff", borderRadius:20, padding:28, width:"100%", maxWidth:wide?700:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 8px 48px rgba(255,0,102,0.15)" }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#0a0a0a", marginBottom:20 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// AGENCY DASHBOARD
// ─────────────────────────────────────────────

function AgencyDashboard({ clients, onSelectClient, onAddClient, onLogout }) {
  const allIdeas = clients.flatMap(c=>c.ideas);
  const pending = allIdeas.filter(i=>i.status==="pending").length;

  return (
    <div style={{ minHeight:"100vh", background:"#fdf6f8" }}>
      <Header title="Agency View" right={<Btn variant="ghost" small onClick={onLogout}>Sign out</Btn>} />
      <StatBar ideas={allIdeas} extra={pending>0?[{label:"Pending Approval",value:pending,emoji:"⏳"}]:[]} />
      <main style={{ maxWidth:900, margin:"0 auto", padding:"28px 24px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:22, color:"#0a0a0a" }}>Your Clients</div>
          <Btn small onClick={onAddClient}>+ Add Client</Btn>
        </div>
        <div style={{ display:"grid", gap:14 }}>
          {clients.map(client => {
            const counts = Object.keys(STATUS_CONFIG).reduce((a,k)=>{a[k]=client.ideas.filter(i=>i.status===k).length;return a;},{});
            const hasUrgent = counts.uploaded_raw>0 || counts.pending>0;
            return (
              <div key={client.id} onClick={()=>onSelectClient(client.id)} style={{ background:"#fff", borderRadius:18, border:`1.5px solid ${hasUrgent?hp+"60":border}`, padding:"20px 24px", cursor:"pointer", boxShadow:hasUrgent?"0 4px 20px rgba(255,0,102,0.10)":"0 2px 12px rgba(255,0,102,0.04)", transition:"all 0.2s", display:"flex", alignItems:"center", gap:18 }}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=hp;e.currentTarget.style.transform="translateY(-2px)";}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor=hasUrgent?hp+"60":border;e.currentTarget.style.transform="translateY(0)";}}>
                <Avatar letter={client.avatar} color={client.color} size={52}/>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                    <div style={{ fontWeight:800, fontSize:16, color:"#0a0a0a" }}>{client.name}</div>
                    <div style={{ fontSize:12, color:"#999" }}>{client.handle}</div>
                    {counts.pending>0 && <span style={{ background:"#f5f5f5", color:"#6b6b6b", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700 }}>⏳ {counts.pending} pending</span>}
                    {counts.uploaded_raw>0 && <span style={{ background:hpBg, color:hp, borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700 }}>⚡ {counts.uploaded_raw} needs edit</span>}
                  </div>
                  <div style={{ fontSize:13, color:"#999", marginBottom:10 }}>{client.niche}</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {Object.entries(counts).filter(([,v])=>v>0).map(([k,v])=>(
                      <span key={k} style={{ background:STATUS_COLORS[k].bg, color:STATUS_COLORS[k].color, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>{STATUS_CONFIG[k].emoji} {v} {STATUS_CONFIG[k].label}</span>
                    ))}
                  </div>
                </div>
                <div style={{ color:"#ccc", fontSize:20 }}>→</div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// HEADER
// ─────────────────────────────────────────────

function Header({ title, left, right }) {
  return (
    <header style={{ background:"#fff", borderBottom:`1px solid ${border}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        {left}
        <div style={{ fontFamily:"Georgia,serif", fontSize:22, color:hp }}>✦ FilmIt ✦</div>
        {title && <span style={{ fontSize:13, color:"#ccc" }}>/ {title}</span>}
      </div>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>{right}</div>
    </header>
  );
}

// ─────────────────────────────────────────────
// ADD CLIENT MODAL
// ─────────────────────────────────────────────

function AddClientModal({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:"", handle:"", niche:"", color:"#ff0066" });
  const colors = ["#ff0066","#7c3aed","#0ea5e9","#16a34a","#ea580c","#b45309"];
  return (
    <Modal onClose={onClose} title="Add New Client">
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div><label style={labelSt}>Creator Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="Jessica M." style={inputSt}/></div>
        <div><label style={labelSt}>Handle</label><input value={form.handle} onChange={e=>setForm(f=>({...f,handle:e.target.value}))} placeholder="@jessbudgetfit" style={inputSt}/></div>
        <div><label style={labelSt}>Niche</label><input value={form.niche} onChange={e=>setForm(f=>({...f,niche:e.target.value}))} placeholder="Budget Fitness & Beauty" style={inputSt}/></div>
        <div>
          <label style={labelSt}>Color</label>
          <div style={{ display:"flex", gap:8 }}>{colors.map(c=><button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{ width:32, height:32, borderRadius:"50%", background:c, border:form.color===c?"3px solid #0a0a0a":"3px solid transparent", cursor:"pointer" }}/>)}</div>
        </div>
        <div style={{ display:"flex", gap:10, marginTop:6 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
          <Btn onClick={()=>{ if(!form.name.trim())return; onAdd({ id:"client-"+Date.now(), name:form.name, handle:form.handle||"@"+form.name.toLowerCase().replace(/\s/g,""), niche:form.niche, avatar:form.name[0].toUpperCase(), color:form.color, ideas:[] }); onClose(); }} style={{ flex:2 }}>+ Add Client</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// CSV UPLOAD + TEMPLATE DOWNLOAD
// ─────────────────────────────────────────────

function CSVUploadModal({ onImport, onClose }) {
  const [preview, setPreview] = useState([]);
  const [error, setError] = useState("");

  const downloadTemplate = () => {
    const csv = `type,hook,caption,tags,isUGC,deadline,brief\nReel,"POV: Your hook here","Your caption #hashtag","fitness,budget",false,,\nPost,"Another idea hook","Caption text","makeup,lifestyle",true,2024-06-30,"Brand brief details here"\n`;
    const blob = new Blob([csv], { type:"text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href=url; a.download="filmit-ideas-template.csv"; a.click();
  };

  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const lines = e.target.result.split("\n").filter(l=>l.trim());
        const headers = lines[0].split(",").map(h=>h.trim().replace(/"/g,""));
        const rows = lines.slice(1).map(line => {
          const vals = line.match(/(".*?"|[^,]+)(?=\s*,|\s*$)/g) || [];
          const obj = {};
          headers.forEach((h,i) => { obj[h] = (vals[i]||"").replace(/^"|"$/g,"").trim(); });
          return obj;
        }).filter(r=>r.hook);
        setPreview(rows);
        setError("");
      } catch { setError("Could not parse CSV. Please use the template."); }
    };
    reader.readAsText(file);
  };

  return (
    <Modal onClose={onClose} title="📥 Bulk Upload Ideas" wide>
      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div style={{ background:hpBg, borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>Step 1 — Download the template</div>
            <div style={{ fontSize:12, color:"#999", marginTop:2 }}>Fill it in with your ideas, then upload below</div>
          </div>
          <Btn variant="outline" small onClick={downloadTemplate}>⬇ Download Template</Btn>
        </div>
        <div>
          <label style={labelSt}>Step 2 — Upload your filled CSV</label>
          <div onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>document.getElementById("csv-input").click()}
            style={{ border:`2px dashed ${border}`, borderRadius:12, padding:"24px", textAlign:"center", cursor:"pointer", background:"#fdf6f8" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>📄</div>
            <div style={{ fontSize:13, color:"#999" }}>Drop CSV here or tap to browse</div>
            <input id="csv-input" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
          </div>
          {error && <div style={{ color:"#dc2626", fontSize:12, marginTop:6 }}>{error}</div>}
        </div>
        {preview.length>0 && (
          <div>
            <label style={labelSt}>Preview — {preview.length} ideas found</label>
            <div style={{ maxHeight:200, overflowY:"auto", border:`1px solid ${border}`, borderRadius:10 }}>
              {preview.map((r,i)=>(
                <div key={i} style={{ padding:"10px 14px", borderBottom:`1px solid ${border}`, fontSize:13 }}>
                  <span style={{ background:r.type==="Reel"?"#f5f0ff":"#f0f9ff", color:r.type==="Reel"?"#7c3aed":"#0ea5e9", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:700, marginRight:8 }}>{r.type||"Reel"}</span>
                  {r.isUGC==="true" && <span style={{ background:"#f5f0ff", color:"#7c3aed", borderRadius:6, padding:"1px 8px", fontSize:11, fontWeight:700, marginRight:8, border:"1px solid #7c3aed40" }}>UGC</span>}
                  {r.hook}
                </div>
              ))}
            </div>
            <div style={{ display:"flex", gap:10, marginTop:14 }}>
              <Btn variant="ghost" onClick={()=>setPreview([])} style={{ flex:1 }}>Clear</Btn>
              <Btn onClick={()=>{ onImport(preview); onClose(); }} style={{ flex:2 }}>✓ Import {preview.length} Ideas</Btn>
            </div>
          </div>
        )}
        {preview.length===0 && <Btn variant="ghost" onClick={onClose}>Cancel</Btn>}
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// THREAD
// ─────────────────────────────────────────────

function Thread({ thread, onSend, role }) {
  const [msg, setMsg] = useState("");
  const bottomRef = useRef();
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[thread]);
  return (
    <div style={{ marginTop:14 }} onClick={e=>e.stopPropagation()}>
      <label style={labelSt}>Notes Thread</label>
      <div style={{ background:"#fdf6f8", border:`1.5px solid ${border}`, borderRadius:12, overflow:"hidden" }}>
        <div style={{ maxHeight:180, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
          {thread.length===0 && <div style={{ fontSize:12, color:"#ccc", textAlign:"center", padding:"12px 0" }}>No messages yet</div>}
          {thread.map((m,i)=>{
            const isMe = m.from===role;
            return (
              <div key={i} style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"80%", background:isMe?hp:"#fff", color:isMe?"#fff":"#0a0a0a", borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px", padding:"8px 12px", fontSize:13, border:isMe?"none":`1px solid ${border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize:10, fontWeight:700, opacity:0.6, marginBottom:3 }}>{m.from==="agency"?"🏢 Agency":"🎬 Creator"} · {m.time}</div>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>
        <div style={{ borderTop:`1px solid ${border}`, display:"flex" }}>
          <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&msg.trim()){ onSend(msg.trim()); setMsg(""); }}} placeholder="Add a note..." style={{ flex:1, border:"none", padding:"10px 14px", fontSize:13, outline:"none", background:"transparent" }}/>
          <button onClick={()=>{ if(msg.trim()){ onSend(msg.trim()); setMsg(""); }}} style={{ background:hp, color:"#fff", border:"none", padding:"10px 16px", fontWeight:700, fontSize:13, cursor:"pointer" }}>Send</button>
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
  const handleFile = useCallback((file)=>{
    if(!file)return;
    const reader = new FileReader();
    reader.onload = (e) => onUpload(idea.id,{ name:file.name, size:file.size, type:file.type, dataUrl:e.target.result });
    reader.readAsDataURL(file);
  },[idea.id,onUpload]);

  if(idea.uploadedFileName) {
    const isVideo = idea.uploadedFileType?.startsWith("video/");
    const isImage = idea.uploadedFileType?.startsWith("image/");
    const sizeMB = idea.uploadedFileSize?(idea.uploadedFileSize/1024/1024).toFixed(1):"?";
    return (
      <div style={{ marginTop:14 }} onClick={e=>e.stopPropagation()}>
        <label style={labelSt}>Uploaded File</label>
        <div style={{ background:"#f0fdf4", border:"1.5px solid #86efac", borderRadius:12, overflow:"hidden" }}>
          {isVideo&&idea.uploadedDataUrl&&<video src={idea.uploadedDataUrl} controls style={{ width:"100%", maxHeight:200, display:"block", background:"#000" }}/>}
          {isImage&&idea.uploadedDataUrl&&<img src={idea.uploadedDataUrl} alt="preview" style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }}/>}
          <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <div>
              <div style={{ fontSize:13, color:"#0a0a0a", fontWeight:600 }}>🎥 {idea.uploadedFileName}</div>
              <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{sizeMB} MB</div>
            </div>
            <Btn variant="danger" small onClick={e=>{e.stopPropagation();onUpload(idea.id,null);}}>Remove</Btn>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div style={{ marginTop:14 }} onClick={e=>e.stopPropagation()}>
      <label style={labelSt}>Upload File</label>
      <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
        onDrop={e=>{e.preventDefault();e.stopPropagation();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
        onClick={()=>inputRef.current?.click()}
        style={{ border:`2px dashed ${dragging?hp:border}`, borderRadius:12, padding:"20px", textAlign:"center", cursor:"pointer", background:dragging?hpBg:"#fdf6f8", transition:"all 0.2s" }}>
        <div style={{ fontSize:24, marginBottom:6 }}>📁</div>
        <div style={{ fontSize:13, color:"#999", fontWeight:600 }}>Drop video or image here</div>
        <div style={{ fontSize:11, color:"#ccc", marginTop:3 }}>or tap to browse</div>
        <input ref={inputRef} type="file" accept="video/*,image/*" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// IDEA CARD
// ─────────────────────────────────────────────

function IdeaCard({ idea, role, onStatusChange, onDelete, onUpload, onNoteChange, onThreadSend }) {
  const [expanded, setExpanded] = useState(false);
  const [localNote, setLocalNote] = useState(idea.notes||"");
  const isAgency = role==="agency";
  const isUGC = idea.isUGC;

  return (
    <div style={{ background:"#fff", border:`2px solid ${isUGC?"#7c3aed60":idea.uploadedFileName?"#86efac":border}`, borderRadius:16, padding:"16px 20px", boxShadow:isUGC?"0 2px 16px rgba(124,58,237,0.08)":"0 2px 10px rgba(255,0,102,0.04)", transition:"all 0.2s" }}>
      {/* UGC banner */}
      {isUGC && (
        <div style={{ background:"linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius:8, padding:"6px 12px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color:"#fff", fontWeight:700, fontSize:12 }}>💜 UGC / Brand Deal</span>
          {idea.deadline && <span style={{ color:"#e9d5ff", fontSize:11 }}>📅 Due {new Date(idea.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
        </div>
      )}

      {/* Clickable header */}
      <div onClick={()=>setExpanded(!expanded)} style={{ cursor:"pointer" }}>
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10, marginBottom:8 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
            <span style={{ background:idea.type==="Reel"?"#f5f0ff":"#f0f9ff", color:idea.type==="Reel"?"#7c3aed":"#0ea5e9", borderRadius:6, padding:"2px 10px", fontSize:11, fontWeight:800, letterSpacing:0.5, textTransform:"uppercase" }}>{idea.type}</span>
            <Pill status={idea.status}/>
            {idea.uploadedFileName && <span style={{ fontSize:11, color:"#16a34a", fontWeight:700 }}>🎥 attached</span>}
            {(idea.thread?.length||0)>0 && <span style={{ fontSize:11, color:hp, fontWeight:700 }}>💬 {idea.thread.length}</span>}
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:12, color:"#ccc" }}>{expanded?"▲":"▼"}</span>
            {isAgency && idea.status!=="pending" && <button onClick={e=>{e.stopPropagation();onDelete(idea.id);}} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:15 }}>✕</button>}
          </div>
        </div>
        <div style={{ fontFamily:"Georgia,serif", fontSize:15, color:"#0a0a0a", lineHeight:1.5, marginBottom:8 }}>"{idea.hook}"</div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {idea.tags.map(tag=><span key={tag} style={{ color:tagColor(tag), fontSize:11, fontWeight:600 }}>#{tag}</span>)}
        </div>
      </div>

      {/* Expanded */}
      {expanded && (
        <div style={{ marginTop:14, borderTop:`1px solid ${border}`, paddingTop:14 }}>

          {/* Caption */}
          <div style={{ marginBottom:14 }}>
            <label style={labelSt}>Caption Draft</label>
            <div style={{ fontSize:13, color:"#6b6b6b", lineHeight:1.6, background:"#fdf6f8", padding:"10px 12px", borderRadius:10 }}>{idea.caption}</div>
          </div>

          {/* UGC Brief */}
          {isUGC && (
            <div style={{ marginBottom:14 }}>
              <label style={labelSt}>Brand Brief / Specs</label>
              <div style={{ fontSize:13, color:"#4c1d95", lineHeight:1.6, background:"#f5f0ff", padding:"10px 12px", borderRadius:10, border:"1px solid #c4b5fd" }}>
                {idea.brief || <span style={{ color:"#a78bfa" }}>No brief added yet</span>}
              </div>
              {idea.deadline && (
                <div style={{ marginTop:8, fontSize:12, color:"#7c3aed", fontWeight:600 }}>
                  📅 Deadline: {new Date(idea.deadline).toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}
                </div>
              )}
            </div>
          )}

          {/* Pending approval actions for agency */}
          {idea.status==="pending" && isAgency && (
            <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:12, padding:"12px 16px", marginBottom:14 }}>
              <div style={{ fontWeight:700, fontSize:13, color:"#854d0e", marginBottom:10 }}>⏳ Creator submitted this idea — approve or reject?</div>
              <div style={{ display:"flex", gap:10 }}>
                <Btn onClick={e=>{e.stopPropagation();onStatusChange(idea.id,"idea");}} style={{ flex:1, background:"#16a34a", color:"#fff", border:"none" }}>✓ Approve</Btn>
                <Btn variant="danger" onClick={e=>{e.stopPropagation();onDelete(idea.id);}} style={{ flex:1 }}>✕ Reject</Btn>
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom:14 }}>
            <label style={labelSt}>Quick Notes</label>
            <textarea value={localNote} onChange={e=>setLocalNote(e.target.value)} onBlur={()=>{ if(localNote!==idea.notes) onNoteChange(idea.id,localNote); }} onClick={e=>e.stopPropagation()} placeholder="e.g. 'Add trending audio', 'Cut at 0:14'..." rows={2} style={inputSt}/>
          </div>

          <UploadZone idea={idea} onUpload={onUpload}/>
          <Thread thread={idea.thread||[]} onSend={(text)=>onThreadSend(idea.id,text)} role={role}/>

          {/* Status buttons — hide for pending if creator */}
          {!(idea.status==="pending" && role==="creator") && (
            <div style={{ marginTop:14 }}>
              <label style={labelSt}>Update Status</label>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {Object.entries(STATUS_CONFIG).map(([key,cfg])=>
                  key!==idea.status && key!=="pending" && !(key==="idea"&&idea.status==="pending"&&!isAgency) && (
                    <button key={key} onClick={e=>{e.stopPropagation();onStatusChange(idea.id,key);}} style={{ background:STATUS_COLORS[key].bg, color:STATUS_COLORS[key].color, border:`1px solid ${STATUS_COLORS[key].color}40`, borderRadius:8, padding:"7px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>
                      {cfg.emoji} {cfg.label}
                    </button>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// ADD / SUGGEST IDEA MODAL
// ─────────────────────────────────────────────

function AddIdeaModal({ onAdd, onClose, isCreator }) {
  const [form, setForm] = useState({ type:"Reel", hook:"", caption:"", tags:"", isUGC:false, deadline:"", brief:"" });
  return (
    <Modal onClose={onClose} title={isCreator?"💡 Suggest an Idea":"Add New Idea"} wide>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {isCreator && <div style={{ background:"#fefce8", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#854d0e" }}>Your idea will be sent to your agency for approval before it goes live on your board.</div>}
        <div>
          <label style={labelSt}>Content Type</label>
          <div style={{ display:"flex", gap:10 }}>
            {["Reel","Post"].map(t=><button key={t} onClick={()=>setForm(f=>({...f,type:t}))} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${form.type===t?hp:border}`, background:form.type===t?hpBg:"#fff", color:form.type===t?hp:"#999", fontWeight:700, cursor:"pointer", fontSize:14 }}>{t}</button>)}
          </div>
        </div>
        <div><label style={labelSt}>Hook / Video Idea *</label><textarea value={form.hook} onChange={e=>setForm(f=>({...f,hook:e.target.value}))} placeholder='"POV: You just found a $5 dupe that slaps"' rows={3} style={inputSt}/></div>
        <div><label style={labelSt}>Caption Draft</label><textarea value={form.caption} onChange={e=>setForm(f=>({...f,caption:e.target.value}))} placeholder="Caption + hashtags..." rows={3} style={inputSt}/></div>
        <div><label style={labelSt}>Tags (comma-separated)</label><input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="fitness, budget, makeup" style={{ ...inputSt, resize:"none" }}/></div>

        {/* UGC toggle */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#f5f0ff", borderRadius:10, border:"1px solid #c4b5fd", cursor:"pointer" }} onClick={()=>setForm(f=>({...f,isUGC:!f.isUGC}))}>
          <div style={{ width:40, height:22, borderRadius:11, background:form.isUGC?"#7c3aed":"#e5e7eb", transition:"all 0.2s", position:"relative" }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:form.isUGC?20:2, transition:"all 0.2s" }}/>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:"#4c1d95" }}>💜 UGC / Brand Deal</div>
            <div style={{ fontSize:11, color:"#7c3aed" }}>Toggle on for sponsored content</div>
          </div>
        </div>

        {form.isUGC && (
          <>
            <div><label style={labelSt}>Deadline</label><input type="date" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))} style={{ ...inputSt, resize:"none" }}/></div>
            <div><label style={labelSt}>Brief / Specs</label><textarea value={form.brief} onChange={e=>setForm(f=>({...f,brief:e.target.value}))} placeholder="Brand requirements, talking points, must-show products, discount codes..." rows={4} style={inputSt}/></div>
          </>
        )}

        <div style={{ display:"flex", gap:10, marginTop:4 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
          <Btn variant={isCreator?"outline":"primary"} onClick={()=>{
            if(!form.hook.trim())return;
            onAdd({ id:Date.now(), type:form.type, hook:form.hook, caption:form.caption, tags:form.tags.split(",").map(t=>t.trim().replace(/^#/,"")).filter(Boolean), status:isCreator?"pending":"idea", notes:"", thread:[], uploadedFileName:null, uploadedAt:null, isUGC:form.isUGC, deadline:form.deadline||null, brief:form.brief||null });
            onClose();
          }} style={{ flex:2 }}>{isCreator?"📤 Submit for Approval":"+ Add Idea"}</Btn>
        </div>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// EARNINGS TAB
// ─────────────────────────────────────────────

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const thisMonth = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; };
const fmtMoney = (n) => Number(n||0).toLocaleString("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2});
const fmtMonth = (m) => { const [y,mo]=m.split("-"); return `${MONTHS[parseInt(mo)-1]} ${y}`; };

function generateInvoice({ client, month, entries, deals, agencyCut, agencyName }) {
  const monthEntries = entries.filter(e=>e.month===month);
  const amazon = monthEntries.filter(e=>e.platform==="Amazon").reduce((a,e)=>a+Number(e.amount||0),0);
  const ltk = monthEntries.filter(e=>e.platform==="LTK").reduce((a,e)=>a+Number(e.amount||0),0);
  const other = monthEntries.filter(e=>e.platform==="Other").reduce((a,e)=>a+Number(e.amount||0),0);
  const monthDeals = deals.filter(d=>d.month===month&&d.status==="paid");
  const dealsTotal = monthDeals.reduce((a,d)=>a+Number(d.amount||0),0);
  const total = amazon+ltk+other+dealsTotal;
  const agencyAmt = total*(agencyCut/100);
  const invoiceNum = `INV-${month.replace("-","")}-${client.id.slice(-4).toUpperCase()}`;
  const today = new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${invoiceNum}</title>
  <style>
    body{font-family:Georgia,serif;margin:0;padding:40px;background:#fff;color:#0a0a0a;max-width:700px;margin:0 auto;}
    .logo{font-size:28px;color:#ff0066;margin-bottom:4px;} .sub{font-size:13px;color:#999;margin-bottom:32px;}
    .row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;}
    .label{font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px;}
    .val{font-size:14px;color:#0a0a0a;}
    .divider{border:none;border-top:1px solid #f0d0dc;margin:20px 0;}
    table{width:100%;border-collapse:collapse;margin:16px 0;}
    th{text-align:left;font-size:10px;font-weight:700;color:#999;text-transform:uppercase;letter-spacing:0.8px;padding:8px 0;border-bottom:2px solid #f0d0dc;}
    td{padding:12px 0;border-bottom:1px solid #fce8f0;font-size:14px;}
    td:last-child,th:last-child{text-align:right;}
    .total-row td{font-weight:700;font-size:15px;border-bottom:none;padding-top:16px;}
    .owed{background:#fff0f6;border:2px solid #ff0066;border-radius:12px;padding:20px 24px;margin-top:28px;display:flex;justify-content:space-between;align-items:center;}
    .owed-label{font-size:13px;color:#ff0066;font-weight:700;}
    .owed-amount{font-size:32px;font-weight:800;color:#ff0066;}
    .footer{margin-top:40px;font-size:11px;color:#ccc;text-align:center;}
    .badge{display:inline-block;background:#f0fdf4;color:#16a34a;border-radius:20px;padding:2px 10px;font-size:11px;font-weight:700;}
  </style></head><body>
  <div class="logo">✦ FilmIt ✦</div>
  <div class="sub">Creator Earnings Statement</div>
  <div class="row">
    <div><div class="label">Invoice #</div><div class="val">${invoiceNum}</div></div>
    <div><div class="label">Date Issued</div><div class="val">${today}</div></div>
    <div><div class="label">Period</div><div class="val">${fmtMonth(month)}</div></div>
  </div>
  <div class="row">
    <div><div class="label">Creator</div><div class="val">${client.name}<br><span style="color:#999;font-size:12px">${client.handle}</span></div></div>
    <div><div class="label">Agency</div><div class="val">${agencyName || "Your Agency"}<br><span style="color:#999;font-size:12px">Commission: ${agencyCut}%</span></div></div>
  </div>
  <hr class="divider"/>
  <table>
    <thead><tr><th>Description</th><th>Notes</th><th>Amount</th></tr></thead>
    <tbody>
      ${amazon>0?`<tr><td>📦 Amazon Storefront</td><td style="color:#999;font-size:12px">${monthEntries.filter(e=>e.platform==="Amazon").map(e=>e.note).filter(Boolean).join(", ")||"—"}</td><td>${fmtMoney(amazon)}</td></tr>`:""}
      ${ltk>0?`<tr><td>🛍 LTK</td><td style="color:#999;font-size:12px">${monthEntries.filter(e=>e.platform==="LTK").map(e=>e.note).filter(Boolean).join(", ")||"—"}</td><td>${fmtMoney(ltk)}</td></tr>`:""}
      ${other>0?`<tr><td>🔗 Other Affiliate</td><td style="color:#999;font-size:12px">${monthEntries.filter(e=>e.platform==="Other").map(e=>e.note).filter(Boolean).join(", ")||"—"}</td><td>${fmtMoney(other)}</td></tr>`:""}
      ${monthDeals.map(d=>`<tr><td>💜 Brand Deal — ${d.brand}</td><td style="color:#999;font-size:12px">${d.description||"—"}</td><td>${fmtMoney(d.amount)}</td></tr>`).join("")}
      <tr class="total-row"><td colspan="2">Total Gross Earnings</td><td>${fmtMoney(total)}</td></tr>
    </tbody>
  </table>
  <hr class="divider"/>
  <table>
    <tbody>
      <tr><td>Creator Keeps (${100-agencyCut}%)</td><td></td><td>${fmtMoney(total*(1-agencyCut/100))}</td></tr>
      <tr style="color:#ff0066"><td><strong>Agency Commission (${agencyCut}%)</strong></td><td></td><td><strong>${fmtMoney(agencyAmt)}</strong></td></tr>
    </tbody>
  </table>
  <div class="owed">
    <div><div class="owed-label">Amount Creator Owes Agency</div><div style="font-size:12px;color:#999;margin-top:4px">${agencyCut}% commission on ${fmtMoney(total)} gross earnings</div></div>
    <div class="owed-amount">${fmtMoney(agencyAmt)}</div>
  </div>
  <div class="footer">Generated by FilmIt &nbsp;·&nbsp; ${today} &nbsp;·&nbsp; ${invoiceNum}</div>
  </body></html>`;

  const blob = new Blob([html],{type:"text/html"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`FilmIt-Invoice-${client.name.replace(/\s/g,"-")}-${month}.html`;
  a.click(); URL.revokeObjectURL(url);
}

function EarningsTab({ client, role, onUpdateClient }) {
  const isAgency = role==="agency";
  const earnings = client.earnings || { agencyName:"Your Agency", agencyCut:20, entries:[], brandDeals:[] };
  const [month, setMonth] = useState(thisMonth());
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddDeal, setShowAddDeal] = useState(false);
  const [agencyCutEdit, setAgencyCutEdit] = useState(false);
  const [cutVal, setCutVal] = useState(earnings.agencyCut);
  const [agencyNameEdit, setAgencyNameEdit] = useState(false);
  const [nameVal, setNameVal] = useState(earnings.agencyName||"Your Agency");

  const update = (e) => onUpdateClient({ ...client, earnings: e });

  const monthEntries = (earnings.entries||[]).filter(e=>e.month===month);
  const amazon = monthEntries.filter(e=>e.platform==="Amazon").reduce((a,e)=>a+Number(e.amount||0),0);
  const ltk = monthEntries.filter(e=>e.platform==="LTK").reduce((a,e)=>a+Number(e.amount||0),0);
  const otherAffiliate = monthEntries.filter(e=>e.platform==="Other").reduce((a,e)=>a+Number(e.amount||0),0);
  const deals = earnings.brandDeals||[];
  const paidDeals = deals.filter(d=>d.status==="paid").reduce((a,d)=>a+Number(d.amount||0),0);
  const pendingDeals = deals.filter(d=>d.status!=="paid").reduce((a,d)=>a+Number(d.amount||0),0);
  const monthDeals = deals.filter(d=>d.month===month&&d.status==="paid").reduce((a,d)=>a+Number(d.amount||0),0);
  const monthTotal = amazon+ltk+otherAffiliate+monthDeals;
  const agencyEarns = monthTotal*(earnings.agencyCut/100);
  const creatorEarns = monthTotal-agencyEarns;
  const allTimeTotal = (earnings.entries||[]).reduce((a,e)=>a+Number(e.amount||0),0)+paidDeals;

  const monthOptions = Array.from({length:12},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });

  const StatCard = ({label,value,sub,color,bg}) => (
    <div style={{ background:bg||hpBg, borderRadius:14, padding:"16px 18px", border:`1px solid ${border}`, flex:1, minWidth:130 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:color||hp, lineHeight:1 }}>{fmtMoney(value)}</div>
      {sub && <div style={{ fontSize:11, color:"#999", marginTop:4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>

      {/* Creator read-only banner */}
      {!isAgency && (
        <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:12, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#854d0e" }}>
          Your earnings are entered by your agency. Review your numbers below and reach out via the notes thread if anything looks off.
        </div>
      )}

      {/* Agency settings bar */}
      {isAgency && (
        <div style={{ background:"#fff", borderRadius:14, padding:"14px 18px", border:`1px solid ${border}`, marginBottom:20, display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Agency Name (on invoices)</div>
            {agencyNameEdit ? (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input value={nameVal} onChange={e=>setNameVal(e.target.value)} style={{ ...inputSt, padding:"5px 10px", width:180 }}/>
                <Btn small onClick={()=>{ update({...earnings,agencyName:nameVal}); setAgencyNameEdit(false); }}>Save</Btn>
              </div>
            ) : (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontWeight:700, fontSize:14 }}>{earnings.agencyName||"Your Agency"}</span>
                <Btn variant="ghost" small onClick={()=>setAgencyNameEdit(true)}>Edit</Btn>
              </div>
            )}
          </div>
          <div>
            <div style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Commission Rate</div>
            {agencyCutEdit ? (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" value={cutVal} onChange={e=>setCutVal(e.target.value)} style={{ ...inputSt, width:60, padding:"5px 10px" }} min={0} max={100}/>
                <span style={{ color:"#999" }}>%</span>
                <Btn small onClick={()=>{ update({...earnings,agencyCut:Number(cutVal)}); setAgencyCutEdit(false); }}>Save</Btn>
              </div>
            ) : (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <span style={{ fontWeight:800, fontSize:20, color:hp }}>{earnings.agencyCut}%</span>
                <Btn variant="ghost" small onClick={()=>setAgencyCutEdit(true)}>Edit</Btn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Month picker + invoice button */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#0a0a0a" }}>Earnings — {fmtMonth(month)}</div>
        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
          <select value={month} onChange={e=>setMonth(e.target.value)} style={{ ...inputSt, width:"auto", padding:"7px 12px", resize:"none" }}>
            {monthOptions.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
          </select>
          {isAgency && (
            <Btn variant="outline" small onClick={()=>generateInvoice({ client, month, entries:earnings.entries||[], deals:earnings.brandDeals||[], agencyCut:earnings.agencyCut, agencyName:earnings.agencyName })}>
              🧾 Generate Invoice
            </Btn>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        <StatCard label="Total Gross" value={monthTotal} sub={fmtMonth(month)} color={hp} bg={hpBg}/>
        <StatCard label="Creator Keeps" value={creatorEarns} sub={`${100-earnings.agencyCut}% of gross`} color="#16a34a" bg="#f0fdf4"/>
        {isAgency && <StatCard label="Agency Earns" value={agencyEarns} sub={`${earnings.agencyCut}% commission`} color="#7c3aed" bg="#f5f0ff"/>}
        <StatCard label="All-Time Gross" value={allTimeTotal} sub="All months" color="#0a0a0a" bg="#fff"/>
      </div>

      {/* Affiliate income */}
      <div style={{ background:"#fff", borderRadius:14, border:`1px solid ${border}`, padding:"18px 20px", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>Affiliate Income</div>
          {isAgency && <Btn small onClick={()=>setShowAddEntry(true)}>+ Add Entry</Btn>}
        </div>

        {/* Platform rows */}
        <div style={{ display:"grid", gap:10 }}>
          {[["Amazon Storefront","Amazon","#ea580c","📦"],[" LTK","LTK","#ff0066","🛍"],["Other Affiliate","Other","#7c3aed","🔗"]].map(([label,platform,color,icon])=>{
            const val = monthEntries.filter(e=>e.platform===platform).reduce((a,e)=>a+Number(e.amount||0),0);
            const ents = monthEntries.filter(e=>e.platform===platform);
            return (
              <div key={platform} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"12px 14px", background:"#fdf6f8", borderRadius:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <span style={{ fontSize:20 }}>{icon}</span>
                  <div>
                    <div style={{ fontWeight:700, fontSize:13, color:"#0a0a0a" }}>{label}</div>
                    <div style={{ fontSize:11, color:"#999" }}>{ents.length} {ents.length===1?"entry":"entries"}</div>
                  </div>
                </div>
                <div style={{ fontWeight:800, fontSize:16, color:val>0?color:"#ccc" }}>{fmtMoney(val)}</div>
              </div>
            );
          })}
        </div>

        {/* Entry list */}
        {monthEntries.length>0 && (
          <div style={{ marginTop:14, borderTop:`1px solid ${border}`, paddingTop:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>Line Items</div>
            <div style={{ display:"grid", gap:6 }}>
              {monthEntries.map(e=>(
                <div key={e.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13, padding:"6px 0", borderBottom:`1px solid #fdf6f8` }}>
                  <div style={{ color:"#6b6b6b" }}>{e.platform}{e.note?` · ${e.note}`:""}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontWeight:700, color:"#0a0a0a" }}>{fmtMoney(e.amount)}</span>
                    {isAgency && <button onClick={()=>update({...earnings,entries:(earnings.entries||[]).filter(x=>x.id!==e.id)})} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:13 }}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {monthEntries.length===0 && !isAgency && (
          <div style={{ textAlign:"center", padding:"20px", color:"#ccc", fontSize:13 }}>No affiliate entries added yet for {fmtMonth(month)}</div>
        )}
      </div>

      {/* Brand Deals */}
      <div style={{ background:"#fff", borderRadius:14, border:`1px solid ${border}`, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>Brand Deals</div>
            <div style={{ fontSize:12, color:"#999", marginTop:2 }}>{fmtMoney(pendingDeals)} pending · {fmtMoney(paidDeals)} paid all-time</div>
          </div>
          {isAgency && <Btn small variant="purple" onClick={()=>setShowAddDeal(true)}>+ Add Deal</Btn>}
        </div>
        {deals.length===0 && <div style={{ textAlign:"center", padding:"24px", color:"#ccc", fontSize:13 }}>No brand deals tracked yet</div>}
        <div style={{ display:"grid", gap:10 }}>
          {deals.map(deal=>(
            <div key={deal.id} style={{ background:deal.status==="paid"?"#f0fdf4":"#fefce8", borderRadius:12, padding:"14px 16px", border:`1px solid ${deal.status==="paid"?"#86efac":"#fde047"}` }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{deal.brand}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:deal.status==="paid"?"#16a34a":"#b45309", background:deal.status==="paid"?"#dcfce7":"#fef9c3", borderRadius:20, padding:"1px 8px" }}>{deal.status==="paid"?"✓ Paid":"⏳ Pending"}</span>
                  </div>
                  {deal.description && <div style={{ fontSize:12, color:"#6b6b6b", marginBottom:4 }}>{deal.description}</div>}
                  <div style={{ display:"flex", gap:12, fontSize:11, color:"#999" }}>
                    {deal.dueDate && <span>Due: {new Date(deal.dueDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                    {deal.paidDate && <span>Paid: {new Date(deal.paidDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:18, color:"#0a0a0a" }}>{fmtMoney(deal.amount)}</div>
                  {isAgency && <div style={{ fontSize:11, color:"#7c3aed", marginTop:2 }}>Your cut: {fmtMoney(deal.amount*(earnings.agencyCut/100))}</div>}
                </div>
              </div>
              {isAgency && deal.status!=="paid" && (
                <div style={{ marginTop:10, display:"flex", gap:8 }}>
                  <Btn small onClick={()=>{ const m=thisMonth(); const updated=deals.map(d=>d.id===deal.id?{...d,status:"paid",paidDate:new Date().toISOString().split("T")[0],month:m}:d); update({...earnings,brandDeals:updated}); }}>Mark as Paid</Btn>
                  <button onClick={()=>update({...earnings,brandDeals:deals.filter(d=>d.id!==deal.id)})} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:12 }}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invoice preview note */}
      {isAgency && monthTotal>0 && (
        <div style={{ marginTop:20, background:"linear-gradient(135deg,#fff0f6,#fce8f0)", borderRadius:14, padding:"16px 20px", border:`1px solid ${border}`, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>Ready to invoice for {fmtMonth(month)}?</div>
            <div style={{ fontSize:12, color:"#999", marginTop:2 }}>{client.name} owes <strong style={{ color:hp }}>{fmtMoney(agencyEarns)}</strong> ({earnings.agencyCut}% of {fmtMoney(monthTotal)})</div>
          </div>
          <Btn onClick={()=>generateInvoice({ client, month, entries:earnings.entries||[], deals:earnings.brandDeals||[], agencyCut:earnings.agencyCut, agencyName:earnings.agencyName })}>
            🧾 Download Invoice
          </Btn>
        </div>
      )}

      {showAddEntry && (
        <Modal onClose={()=>setShowAddEntry(false)} title="Add Affiliate Entry">
          <AddEntryForm month={month} onAdd={(entry)=>{ update({...earnings,entries:[...(earnings.entries||[]),entry]}); setShowAddEntry(false); }} onClose={()=>setShowAddEntry(false)}/>
        </Modal>
      )}
      {showAddDeal && (
        <Modal onClose={()=>setShowAddDeal(false)} title="Add Brand Deal">
          <AddDealForm onAdd={(deal)=>{ update({...earnings,brandDeals:[...(earnings.brandDeals||[]),deal]}); setShowAddDeal(false); }} onClose={()=>setShowAddDeal(false)}/>
        </Modal>
      )}
    </div>
  );
}

function AddEntryForm({ month, onAdd, onClose }) {
  const [form, setForm] = useState({ platform:"Amazon", amount:"", note:"" });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div>
        <label style={labelSt}>Platform</label>
        <div style={{ display:"flex", gap:8 }}>
          {["Amazon","LTK","Other"].map(p=>(
            <button key={p} onClick={()=>setForm(f=>({...f,platform:p}))} style={{ flex:1, padding:"9px", borderRadius:10, border:`2px solid ${form.platform===p?hp:border}`, background:form.platform===p?hpBg:"#fff", color:form.platform===p?hp:"#999", fontWeight:700, cursor:"pointer", fontSize:13 }}>{p}</button>
          ))}
        </div>
      </div>
      <div><label style={labelSt}>Amount Earned ($)</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Note (optional)</label><input value={form.note} onChange={e=>setForm(f=>({...f,note:e.target.value}))} placeholder="e.g. May commission report" style={{ ...inputSt, resize:"none" }}/></div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={()=>{ if(!form.amount)return; onAdd({ id:Date.now(), platform:form.platform, amount:Number(form.amount), note:form.note, month }); }} style={{ flex:2 }}>+ Add Entry</Btn>
      </div>
    </div>
  );
}

function AddDealForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ brand:"", amount:"", description:"", dueDate:"" });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div><label style={labelSt}>Brand Name *</label><input value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="e.g. Maybelline" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Deal Amount ($) *</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Description</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. 60s Reel + 3 stories" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Payment Due Date</label><input type="date" value={form.dueDate} onChange={e=>setForm(f=>({...f,dueDate:e.target.value}))} style={{ ...inputSt, resize:"none" }}/></div>
      <div style={{ display:"flex", gap:10 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={()=>{ if(!form.brand||!form.amount)return; onAdd({ id:Date.now(), brand:form.brand, amount:Number(form.amount), description:form.description, dueDate:form.dueDate, status:"pending", paidDate:null }); }} style={{ flex:2 }}>+ Add Deal</Btn>
      </div>
    </div>
  );
}



// ─────────────────────────────────────────────
// ANALYTICS TAB
// ─────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { id:"instagram", name:"Instagram",  color:"#e1306c", icon:"📸", metrics:["Followers","Impressions","Reach","Profile Visits","Accounts Engaged"] },
  { id:"tiktok",    name:"TikTok",     color:"#010101", icon:"🎵", metrics:["Followers","Video Views","Likes","Comments","Shares"] },
  { id:"youtube",   name:"YouTube",    color:"#ff0000", icon:"🎬", metrics:["Subscribers","Views","Watch Time (hrs)","Impressions","Click-Through Rate"] },
  { id:"facebook",  name:"Facebook",   color:"#1877f2", icon:"📄", metrics:["Followers","Reach","Impressions","Post Engagements","Page Views"] },
  { id:"pinterest", name:"Pinterest",  color:"#e60023", icon:"📌", metrics:["Followers","Impressions","Saves","Link Clicks","Outbound Clicks"] },
];

function AnalyticsTab({ client, role, onUpdateClient }) {
  const isAgency = role === "agency";
  const [analyticsData, setAnalyticsData] = useState(client.analytics || {});
  const [editingPlatform, setEditingPlatform] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(thisMonth());

  const monthOptions = Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-i); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; });

  const getMetricValue = (platformId, metric, month) => {
    return analyticsData?.[platformId]?.[month]?.[metric] || "";
  };

  const saveMetrics = (platformId) => {
    const updated = {
      ...analyticsData,
      [platformId]: {
        ...(analyticsData[platformId] || {}),
        [selectedMonth]: { ...(analyticsData[platformId]?.[selectedMonth] || {}), ...editValues },
      },
    };
    setAnalyticsData(updated);
    onUpdateClient({ ...client, analytics: updated });
    setEditingPlatform(null);
    setEditValues({});
  };

  const formatNum = (n) => {
    if (!n) return "—";
    const num = Number(String(n).replace(/,/g,""));
    if (isNaN(num)) return n;
    if (num >= 1000000) return (num/1000000).toFixed(1) + "M";
    if (num >= 1000) return (num/1000).toFixed(1) + "K";
    return num.toLocaleString();
  };

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>

      {/* Connect banner */}
      <div style={{ background:"linear-gradient(135deg,#fff0f6,#fce8f0)", border:`1px solid ${border}`, borderRadius:14, padding:"16px 20px", marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>Social Media Analytics</div>
          <div style={{ fontSize:12, color:"#999", marginTop:3 }}>
            Enter monthly numbers manually now. Instagram & TikTok API connections coming soon to pull data automatically.
          </div>
        </div>
        <span style={{ background:hpBg, color:hp, borderRadius:20, padding:"5px 14px", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
          Manual Entry Mode
        </span>
      </div>

      {/* Month selector */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:18, color:"#0a0a0a" }}>Monthly Snapshot</div>
        <select value={selectedMonth} onChange={e=>setSelectedMonth(e.target.value)} style={{ ...inputSt, width:"auto", padding:"7px 12px", resize:"none" }}>
          {monthOptions.map(m=><option key={m} value={m}>{fmtMonth(m)}</option>)}
        </select>
      </div>

      {/* Platform cards */}
      <div style={{ display:"grid", gap:14 }}>
        {SOCIAL_PLATFORMS.map(platform => {
          const isEditing = editingPlatform === platform.id;
          const hasData = SOCIAL_PLATFORMS.find(p=>p.id===platform.id)?.metrics.some(m => getMetricValue(platform.id, m, selectedMonth));

          return (
            <div key={platform.id} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${hasData?platform.color+"40":border}`, overflow:"hidden" }}>
              {/* Platform header */}
              <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:platform.color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                    {platform.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15, color:"#0a0a0a" }}>{platform.name}</div>
                    <div style={{ fontSize:11, color:"#999" }}>{fmtMonth(selectedMonth)} metrics</div>
                  </div>
                </div>
                {isAgency && !isEditing && (
                  <Btn variant="ghost" small onClick={()=>{ setEditingPlatform(platform.id); const current={}; platform.metrics.forEach(m=>{current[m]=getMetricValue(platform.id,m,selectedMonth);}); setEditValues(current); }}>
                    Edit Numbers
                  </Btn>
                )}
                {isAgency && isEditing && (
                  <div style={{ display:"flex", gap:8 }}>
                    <Btn variant="ghost" small onClick={()=>{ setEditingPlatform(null); setEditValues({}); }}>Cancel</Btn>
                    <Btn small onClick={()=>saveMetrics(platform.id)}>Save</Btn>
                  </div>
                )}
              </div>

              {/* Metrics grid */}
              <div style={{ padding:"0 20px 16px 20px" }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(140px,1fr))", gap:10 }}>
                  {platform.metrics.map(metric => {
                    const val = isEditing ? editValues[metric] : getMetricValue(platform.id, metric, selectedMonth);
                    return (
                      <div key={metric} style={{ background:hasData?"#fdf6f8":"#fafafa", borderRadius:10, padding:"12px 14px", border:`1px solid ${border}` }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>{metric}</div>
                        {isEditing ? (
                          <input
                            value={editValues[metric]||""}
                            onChange={e=>setEditValues(v=>({...v,[metric]:e.target.value}))}
                            placeholder="0"
                            style={{ ...inputSt, padding:"4px 8px", fontSize:16, fontWeight:700 }}
                          />
                        ) : (
                          <div style={{ fontSize:20, fontWeight:800, color:val?platform.color:"#ddd" }}>
                            {val ? formatNum(val) : "—"}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Previous month comparison (if data exists for both) */}
                {!isEditing && hasData && (() => {
                  const prevMonth = monthOptions[1];
                  const prevFollowers = getMetricValue(platform.id, platform.metrics[0], prevMonth);
                  const currFollowers = getMetricValue(platform.id, platform.metrics[0], selectedMonth);
                  if (!prevFollowers || !currFollowers) return null;
                  const prev = Number(String(prevFollowers).replace(/,/g,""));
                  const curr = Number(String(currFollowers).replace(/,/g,""));
                  const diff = curr - prev;
                  const pct = prev > 0 ? ((diff/prev)*100).toFixed(1) : 0;
                  if (!diff) return null;
                  return (
                    <div style={{ marginTop:10, fontSize:12, color:diff>0?"#16a34a":"#dc2626", fontWeight:600 }}>
                      {diff>0?"↗":"↘"} {platform.metrics[0]}: {diff>0?"+":""}{formatNum(Math.abs(diff))} ({diff>0?"+":""}{pct}%) vs last month
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coming soon note */}
      <div style={{ marginTop:24, background:"#f5f5f5", borderRadius:14, padding:"16px 20px", textAlign:"center" }}>
        <div style={{ fontWeight:700, fontSize:14, color:"#999", marginBottom:4 }}>Auto-sync coming soon</div>
        <div style={{ fontSize:12, color:"#ccc" }}>
          Instagram, TikTok, and YouTube API connections will pull impressions, reach, and engagement automatically once enabled
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// BRAND PLATFORMS TAB
// ─────────────────────────────────────────────

const PLATFORMS = [
  { id:"cohley",     name:"Cohley",       url:"https://app.cohley.com",           color:"#ff6b35", desc:"UGC content platform — apply to product campaigns" },
  { id:"fohr",       name:"Fohr",         url:"https://app.fohr.co",              color:"#6c63ff", desc:"Influencer marketplace — brand partnerships & gifting" },
  { id:"later",      name:"Later",        url:"https://app.later.com",            color:"#ffd166", desc:"Social scheduling + brand collab opportunities" },
  { id:"insense",    name:"Insense",      url:"https://insense.pro",              color:"#07b274", desc:"UGC & influencer briefs — fast-moving campaigns" },
  { id:"upfluence",  name:"Upfluence",    url:"https://app.upfluence.com",        color:"#3b82f6", desc:"Enterprise brand partnerships & affiliate deals" },
  { id:"impact",     name:"Impact",       url:"https://app.impact.com",           color:"#f43f5e", desc:"Affiliate & partnership network — commission tracking" },
  { id:"aspire",     name:"Aspire",       url:"https://app.aspireiq.com",         color:"#8b5cf6", desc:"Brand collaboration marketplace & gifting campaigns" },
  { id:"thelobby",   name:"The Lobby",    url:"https://thelobby.io",              color:"#0ea5e9", desc:"Creator community with exclusive brand deals" },
  { id:"mavely",     name:"Mavely",       url:"https://app.joinmavely.com",       color:"#ec4899", desc:"Affiliate links + shoppable content monetization" },
  { id:"ahacreator", name:"AHA Creator",  url:"https://ahacreator.com",           color:"#f97316", desc:"UGC briefs and paid creator campaigns" },
];

const APP_STATUS = {
  none:      { label:"Not Applied",  color:"#ccc",     bg:"#f9f9f9" },
  applied:   { label:"Applied",      color:"#b45309",  bg:"#fefce8" },
  pending:   { label:"Awaiting Response", color:"#7c3aed", bg:"#f5f0ff" },
  accepted:  { label:"Accepted!",    color:"#16a34a",  bg:"#f0fdf4" },
  declined:  { label:"Declined",     color:"#dc2626",  bg:"#fef2f2" },
  completed: { label:"Completed",    color:"#ff0066",  bg:"#fff0f6" },
};

function BrandPlatformsTab({ client, role, onUpdateClient }) {
  const isAgency = role==="agency";
  const platforms = client.platforms || {};
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [showAddApp, setShowAddApp] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");

  const updatePlatforms = (p) => onUpdateClient({ ...client, platforms: p });

  // All applications across all platforms
  const allApps = PLATFORMS.flatMap(p =>
    (platforms[p.id]?.applications || []).map(a => ({ ...a, platformName: p.name, platformColor: p.color, platformId: p.id }))
  );
  const activeApps = allApps.filter(a => a.status !== "none" && a.status !== "completed");
  const pendingApps = allApps.filter(a => a.status === "pending" || a.status === "applied");
  const acceptedApps = allApps.filter(a => a.status === "accepted");

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>

      {/* Summary bar */}
      <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
        {[
          { label:"Platforms", value:PLATFORMS.length, emoji:"🔗", color:"#0a0a0a", bg:"#fff" },
          { label:"Active Applications", value:activeApps.length, emoji:"📋", color:"#7c3aed", bg:"#f5f0ff" },
          { label:"Awaiting Response", value:pendingApps.length, emoji:"⏳", color:"#b45309", bg:"#fefce8" },
          { label:"Accepted Deals", value:acceptedApps.length, emoji:"✓", color:"#16a34a", bg:"#f0fdf4" },
        ].map(s=>(
          <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"14px 16px", border:`1px solid ${border}`, flex:1, minWidth:120, textAlign:"center" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{s.emoji}</div>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#999", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active applications pipeline */}
      {activeApps.length > 0 && (
        <div style={{ background:"#fff", borderRadius:14, border:`1px solid ${border}`, padding:"18px 20px", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a", marginBottom:14 }}>Active Applications Pipeline</div>
          <div style={{ display:"grid", gap:8 }}>
            {activeApps.map(app => (
              <div key={app.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:APP_STATUS[app.status]?.bg||"#f9f9f9", borderRadius:10, border:`1px solid ${APP_STATUS[app.status]?.color}30` }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:app.platformColor, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0a0a0a" }}>{app.brand} <span style={{ color:"#999", fontWeight:400 }}>via {app.platformName}</span></div>
                  {app.amount && <div style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>{fmtMoney(app.amount)}</div>}
                  {app.deadline && <div style={{ fontSize:11, color:"#999" }}>Due {new Date(app.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>}
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:APP_STATUS[app.status]?.color, background:"#fff", borderRadius:20, padding:"3px 10px", border:`1px solid ${APP_STATUS[app.status]?.color}40` }}>
                  {APP_STATUS[app.status]?.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform list */}
      <div style={{ fontFamily:"Georgia,serif", fontSize:18, color:"#0a0a0a", marginBottom:14 }}>All Platforms</div>
      <div style={{ display:"grid", gap:12 }}>
        {PLATFORMS.map(platform => {
          const pd = platforms[platform.id] || { applications:[], notes:"" };
          const apps = pd.applications || [];
          const isExpanded = expandedPlatform === platform.id;
          const hasActive = apps.some(a=>a.status!=="completed");
          const accepted = apps.filter(a=>a.status==="accepted").length;
          const pending = apps.filter(a=>a.status==="applied"||a.status==="pending").length;

          return (
            <div key={platform.id} style={{ background:"#fff", borderRadius:16, border:`1.5px solid ${hasActive?platform.color+"40":border}`, boxShadow:hasActive?`0 2px 12px ${platform.color}15`:"none", overflow:"hidden" }}>
              {/* Platform header */}
              <div onClick={()=>setExpandedPlatform(isExpanded?null:platform.id)} style={{ padding:"16px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:12, background:platform.color+"15", border:`2px solid ${platform.color}30`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                  <span style={{ fontSize:16, fontWeight:800, color:platform.color }}>{platform.name[0]}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
                    <span style={{ fontWeight:800, fontSize:15, color:"#0a0a0a" }}>{platform.name}</span>
                    {accepted>0 && <span style={{ fontSize:11, fontWeight:700, color:"#16a34a", background:"#f0fdf4", borderRadius:20, padding:"1px 8px" }}>{accepted} accepted</span>}
                    {pending>0 && <span style={{ fontSize:11, fontWeight:700, color:"#b45309", background:"#fefce8", borderRadius:20, padding:"1px 8px" }}>{pending} pending</span>}
                  </div>
                  <div style={{ fontSize:12, color:"#999" }}>{platform.desc}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <a href={platform.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ background:platform.color, color:"#fff", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, textDecoration:"none", whiteSpace:"nowrap" }}>
                    Open Platform
                  </a>
                  <span style={{ color:"#ccc", fontSize:14 }}>{isExpanded?"▲":"▼"}</span>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ borderTop:`1px solid ${border}`, padding:"16px 20px" }}>

                  {/* Applications list */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#999", textTransform:"uppercase", letterSpacing:0.6 }}>Applications ({apps.length})</div>
                    <Btn small onClick={()=>setShowAddApp(platform.id)}>+ Track Application</Btn>
                  </div>

                  {apps.length===0 && (
                    <div style={{ textAlign:"center", padding:"20px", color:"#ccc", fontSize:13, background:"#fdf6f8", borderRadius:10 }}>
                      No applications tracked yet — hit a brief on {platform.name} and track it here
                    </div>
                  )}

                  <div style={{ display:"grid", gap:8, marginBottom:apps.length>0?14:0 }}>
                    {apps.map(app=>(
                      <div key={app.id} style={{ background:APP_STATUS[app.status]?.bg||"#f9f9f9", borderRadius:10, padding:"12px 14px", border:`1px solid ${APP_STATUS[app.status]?.color}30` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a", marginBottom:3 }}>{app.brand}</div>
                            {app.description && <div style={{ fontSize:12, color:"#6b6b6b", marginBottom:4 }}>{app.description}</div>}
                            {app.brief && <div style={{ fontSize:12, color:"#4c1d95", background:"#f5f0ff", padding:"6px 10px", borderRadius:8, marginBottom:6, border:"1px solid #c4b5fd" }}>Brief: {app.brief}</div>}
                            <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:11, color:"#999" }}>
                              {app.amount && <span style={{ color:"#16a34a", fontWeight:700 }}>{fmtMoney(app.amount)}</span>}
                              {app.deadline && <span>Deadline: {new Date(app.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                              {app.appliedDate && <span>Applied: {new Date(app.appliedDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:APP_STATUS[app.status]?.color, background:"#fff", borderRadius:20, padding:"3px 10px", border:`1px solid ${APP_STATUS[app.status]?.color}40` }}>{APP_STATUS[app.status]?.label}</span>
                            {isAgency && (
                              <select value={app.status} onChange={e=>{
                                const updated = {...pd, applications:apps.map(a=>a.id===app.id?{...a,status:e.target.value}:a)};
                                updatePlatforms({...platforms,[platform.id]:updated});
                              }} style={{ fontSize:11, border:`1px solid ${border}`, borderRadius:6, padding:"2px 6px", color:"#6b6b6b", background:"#fff" }}>
                                {Object.entries(APP_STATUS).filter(([k])=>k!=="none").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                              </select>
                            )}
                            {isAgency && <button onClick={()=>{
                              const updated={...pd,applications:apps.filter(a=>a.id!==app.id)};
                              updatePlatforms({...platforms,[platform.id]:updated});
                            }} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:12 }}>Remove</button>}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Platform notes */}
                  <div>
                    <label style={labelSt}>Platform Notes</label>
                    <textarea
                      defaultValue={pd.notes||""}
                      onBlur={e=>{
                        const updated={...pd,notes:e.target.value};
                        updatePlatforms({...platforms,[platform.id]:updated});
                      }}
                      placeholder={`Notes about ${platform.name} — login info, contact, tips...`}
                      rows={2}
                      style={inputSt}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Application Modal */}
      {showAddApp && (
        <Modal onClose={()=>setShowAddApp(null)} title={`Track Application — ${PLATFORMS.find(p=>p.id===showAddApp)?.name}`} wide>
          <AddApplicationForm
            onAdd={(app)=>{
              const pd = platforms[showAddApp] || { applications:[], notes:"" };
              const updated = {...pd, applications:[...( pd.applications||[]),app]};
              updatePlatforms({...platforms,[showAddApp]:updated});
              setShowAddApp(null);
            }}
            onClose={()=>setShowAddApp(null)}
          />
        </Modal>
      )}
    </div>
  );
}

function AddApplicationForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ brand:"", amount:"", description:"", brief:"", deadline:"", appliedDate:new Date().toISOString().split("T")[0], status:"applied" });
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div><label style={labelSt}>Brand / Campaign Name *</label><input value={form.brand} onChange={e=>setForm(f=>({...f,brand:e.target.value}))} placeholder="e.g. L'Oreal Summer Campaign" style={{ ...inputSt, resize:"none" }}/></div>
      <div style={{ display:"flex", gap:10 }}>
        <div style={{ flex:1 }}><label style={labelSt}>Deal Amount ($)</label><input type="number" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} placeholder="0.00" style={{ ...inputSt, resize:"none" }}/></div>
        <div style={{ flex:1 }}><label style={labelSt}>Deadline</label><input type="date" value={form.deadline} onChange={e=>setForm(f=>({...f,deadline:e.target.value}))} style={{ ...inputSt, resize:"none" }}/></div>
      </div>
      <div><label style={labelSt}>Campaign Description</label><input value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} placeholder="e.g. 60s Reel featuring new foundation line" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Brief / Requirements</label><textarea value={form.brief} onChange={e=>setForm(f=>({...f,brief:e.target.value}))} placeholder="Paste brief details, talking points, must-mention items..." rows={3} style={inputSt}/></div>
      <div>
        <label style={labelSt}>Status</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {Object.entries(APP_STATUS).filter(([k])=>k!=="none").map(([k,v])=>(
            <button key={k} onClick={()=>setForm(f=>({...f,status:k}))} style={{ padding:"7px 14px", borderRadius:10, border:`2px solid ${form.status===k?v.color:border}`, background:form.status===k?v.bg:"#fff", color:form.status===k?v.color:"#999", fontWeight:700, cursor:"pointer", fontSize:12 }}>{v.label}</button>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={()=>{ if(!form.brand.trim())return; onAdd({ id:Date.now(), ...form, amount:form.amount?Number(form.amount):null }); }} style={{ flex:2 }}>+ Track Application</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CLIENT BOARD
// ─────────────────────────────────────────────

function ClientBoard({ client, role, onBack, onUpdateClient, onLogout }) {
  const [tab, setTab] = useState("ideas");
  const [filter, setFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showCSV, setShowCSV] = useState(false);

  const ideas = client.ideas;
  const isAgency = role==="agency";

  const counts = Object.keys(STATUS_CONFIG).reduce((a,k)=>{ a[k]=ideas.filter(i=>i.status===k).length; return a; },{});

  const filtered = ideas.filter(i=>{
    if(filter!=="all"&&i.status!==filter) return false;
    if(typeFilter!=="all"&&i.type!==typeFilter) return false;
    if(search&&!i.hook.toLowerCase().includes(search.toLowerCase())&&!i.tags.some(t=>t.includes(search.toLowerCase()))) return false;
    return true;
  });

  const updateIdeas = (fn) => onUpdateClient({ ...client, ideas:fn(client.ideas) });
  const handleStatusChange = (id,status) => updateIdeas(prev=>prev.map(i=>i.id===id?{...i,status}:i));
  const handleDelete = (id) => updateIdeas(prev=>prev.filter(i=>i.id!==id));
  const handleNoteChange = (id,notes) => updateIdeas(prev=>prev.map(i=>i.id===id?{...i,notes}:i));
  const handleUpload = useCallback((ideaId,fileObj)=>{
    updateIdeas(prev=>prev.map(i=>i.id===ideaId?fileObj?{...i,uploadedFileName:fileObj.name,uploadedFileSize:fileObj.size,uploadedFileType:fileObj.type,uploadedDataUrl:fileObj.dataUrl,uploadedAt:new Date().toISOString(),status:(i.status==="idea"||i.status==="filming")?"uploaded_raw":i.status}:{...i,uploadedFileName:null,uploadedFileSize:null,uploadedFileType:null,uploadedDataUrl:null,uploadedAt:null}:i));
  },[client]);
  const handleThreadSend = (ideaId,text) => updateIdeas(prev=>prev.map(i=>i.id===ideaId?{...i,thread:[...(i.thread||[]),{from:role,text,time:"just now"}]}:i));
  const handleAddIdea = (idea) => updateIdeas(prev=>[idea,...prev]);
  const handleCSVImport = (rows) => {
    const newIdeas = rows.map(r=>({ id:Date.now()+Math.random(), type:r.type||"Reel", hook:r.hook, caption:r.caption||"", tags:(r.tags||"").split(",").map(t=>t.trim()).filter(Boolean), status:"idea", notes:"", thread:[], uploadedFileName:null, uploadedAt:null, isUGC:r.isUGC==="true", deadline:r.deadline||null, brief:r.brief||null }));
    updateIdeas(prev=>[...newIdeas,...prev]);
  };

  const tabs = [
    { key:"ideas",      label:"Ideas Board",     emoji:"💡" },
    { key:"platforms",  label:"Brand Platforms", emoji:"🔗" },
    { key:"analytics",  label:"Analytics",       emoji:"📊" },
    { key:"earnings",   label:"Earnings",        emoji:"💰" },
  ];

  return (
    <div style={{ minHeight:"100vh", background:"#fdf6f8" }}>
      <Header
        left={isAgency&&<button onClick={onBack} style={{ background:"none", border:"none", color:hp, fontWeight:700, fontSize:14, cursor:"pointer" }}>← All Clients</button>}
        title={`${client.name} · ${client.handle}`}
        right={
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {tab==="ideas" && isAgency && <>
              <Btn variant="ghost" small onClick={()=>setShowCSV(true)}>📥 Bulk Upload</Btn>
              <Btn small onClick={()=>setShowAdd(true)}>+ Add Idea</Btn>
            </>}
            {tab==="ideas" && !isAgency && <Btn variant="outline" small onClick={()=>setShowAdd(true)}>💡 Suggest Idea</Btn>}
            <span style={{ background:isAgency?hpBg:"#f0fdf4", color:isAgency?hp:"#16a34a", borderRadius:20, padding:"4px 12px", fontSize:12, fontWeight:700 }}>{isAgency?"🏢 Agency":"🎬 Creator"}</span>
            <Btn variant="ghost" small onClick={onLogout}>Sign out</Btn>
          </div>
        }
      />

      {/* Big stat bar */}
      <StatBar ideas={ideas} extra={counts.pending>0?[{label:"Pending Approval",value:counts.pending,emoji:"⏳"}]:[]}/>

      {/* Tab nav */}
      <div style={{ background:"#fff", borderBottom:`1px solid ${border}`, padding:"0 24px" }}>
        <div style={{ maxWidth:900, margin:"0 auto", display:"flex", gap:0 }}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:"14px 20px", border:"none", borderBottom:`3px solid ${tab===t.key?hp:"transparent"}`, background:"transparent", color:tab===t.key?hp:"#999", fontWeight:700, fontSize:14, cursor:"pointer", transition:"all 0.15s" }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ideas tab */}
      {tab==="ideas" && (
        <>
          <div style={{ background:"#fff", borderBottom:`1px solid ${border}`, padding:"12px 24px" }}>
            <div style={{ maxWidth:900, margin:"0 auto" }}>
              <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:8, marginBottom:10 }}>
                {[["all","All",ideas.length],...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,`${v.emoji} ${v.label}`,counts[k]||0])].map(([key,label,count])=>(
                  <button key={key} onClick={()=>setFilter(key)} style={{ background:filter===key?(key==="all"?"#0a0a0a":STATUS_COLORS[key]?.bg):"transparent", border:`1.5px solid ${filter===key?(key==="all"?"#0a0a0a":STATUS_COLORS[key]?.color+"60"):border}`, color:filter===key?(key==="all"?"#fff":STATUS_COLORS[key]?.color):"#999", borderRadius:20, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                    {label}{count>0?` (${count})`:""}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ideas..." style={{ ...inputSt, flex:1, padding:"8px 14px" }}/>
                {["all","Reel","Post"].map(t=>(
                  <button key={t} onClick={()=>setTypeFilter(t)} style={{ padding:"8px 14px", borderRadius:10, border:`1.5px solid ${typeFilter===t?hp:border}`, background:typeFilter===t?hpBg:"#fff", color:typeFilter===t?hp:"#999", cursor:"pointer", fontWeight:700, fontSize:13 }}>{t==="all"?"All":t}</button>
                ))}
              </div>
            </div>
          </div>
          <main style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>
            {filtered.length===0?(
              <div style={{ textAlign:"center", padding:"60px 20px", color:"#ccc" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>💡</div>
                <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#999" }}>No ideas here</div>
                <div style={{ fontSize:14, marginTop:6 }}>Try a different filter{isAgency?" or add new ideas":""}</div>
              </div>
            ):(
              <div style={{ display:"grid", gap:12 }}>
                {filtered.map(idea=>(
                  <IdeaCard key={idea.id} idea={idea} role={role} onStatusChange={handleStatusChange} onDelete={handleDelete} onUpload={handleUpload} onNoteChange={handleNoteChange} onThreadSend={handleThreadSend}/>
                ))}
              </div>
            )}
          </main>
        </>
      )}

      {/* Brand Platforms tab */}
      {tab==="platforms" && (
        <BrandPlatformsTab client={client} role={role} onUpdateClient={onUpdateClient}/>
      )}

      {/* Analytics tab */}
      {tab==="analytics" && (
        <AnalyticsTab client={client} role={role} onUpdateClient={onUpdateClient}/>
      )}

      {/* Earnings tab */}
      {tab==="earnings" && (
        <EarningsTab client={client} role={role} onUpdateClient={onUpdateClient}/>
      )}

      {showAdd && <AddIdeaModal onAdd={handleAddIdea} onClose={()=>setShowAdd(false)} isCreator={!isAgency}/>}
      {showCSV && <CSVUploadModal onImport={handleCSVImport} onClose={()=>setShowCSV(false)}/>}
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────

export default function FilmIt({ userInfo, onLogout }) {
  const [clients, setClients] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState(userInfo.role === "agency" ? "dashboard" : "board");
  const [activeClientId, setActiveClientId] = useState(userInfo.role === "creator" ? userInfo.clientId : null);
  const [showAddClient, setShowAddClient] = useState(false);

  // Load all clients + their data from Supabase
  useEffect(() => {
    async function load() {
      const baseClients = await fetchClients();
      const enriched = await Promise.all(baseClients.map(async (c) => {
        const [ideas, entries, deals, apps] = await Promise.all([
          fetchIdeasForClient(c.id),
          fetchEarningsEntries(c.id),
          fetchBrandDeals(c.id),
          fetchPlatformApps(c.id),
        ]);
        // Load messages for each idea
        const ideasWithThreads = await Promise.all(ideas.map(async (idea) => {
          const thread = await fetchMessages(idea.id);
          return { ...idea, thread };
        }));
        // Build platforms object from apps
        const platforms = {};
        apps.forEach(a => {
          if (!platforms[a.platformId]) platforms[a.platformId] = { applications: [], notes: "" };
          platforms[a.platformId].applications.push(a);
        });
        return {
          ...c,
          ideas: ideasWithThreads,
          platforms,
          earnings: { ...c.earnings, entries, brandDeals: deals },
        };
      }));
      setClients(enriched);
      // If creator, auto-select their client
      if (userInfo.role === "creator" && userInfo.clientId) {
        setActiveClientId(userInfo.clientId);
      }
      setLoaded(false);
      setTimeout(() => setLoaded(true), 100);
    }
    load();
  }, []);

  const handleLogout = () => onLogout();

  const handleUpdateClient = async (updatedClient) => {
    setClients(prev => prev.map(c => c.id === updatedClient.id ? updatedClient : c));
    await saveClient(updatedClient);
  };

  const handleAddClient = async (client) => {
    await saveClient(client);
    setClients(prev => [...prev, { ...client, ideas: [], platforms: {}, earnings: { agencyCut: 20, agencyName: "Your Agency", entries: [], brandDeals: [] } }]);
  };

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: "#ff0066", marginBottom: 12 }}>✦ FilmIt ✦</div>
        <div style={{ color: "#ccc", fontSize: 14 }}>Loading your workspace...</div>
      </div>
    </div>
  );

  const activeClient = clients.find(c => c.id === activeClientId);
  const role = userInfo.role;

  if (view === "dashboard" && role === "agency") return (
    <>
      <AgencyDashboard
        clients={clients}
        onSelectClient={(id) => { setActiveClientId(id); setView("board"); }}
        onAddClient={() => setShowAddClient(true)}
        onLogout={handleLogout}
      />
      {showAddClient && <AddClientModal onAdd={handleAddClient} onClose={() => setShowAddClient(false)} />}
    </>
  );

  if (view === "board" && activeClient) return (
    <ClientBoard
      client={activeClient}
      role={role}
      onBack={() => setView("dashboard")}
      onUpdateClient={handleUpdateClient}
      onLogout={handleLogout}
      supabaseFns={{ saveIdea, deleteIdea, sendMessage, saveEarningsEntry, deleteEarningsEntry, saveBrandDeal, deleteBrandDeal, savePlatformApp, deletePlatformApp }}
    />
  );

  // Creator with no client assigned
  if (role === "creator" && !activeClient) return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ textAlign: "center", maxWidth: 400 }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: "#ff0066", marginBottom: 12 }}>✦ FilmIt ✦</div>
        <div style={{ fontSize: 15, color: "#6b6b6b", marginBottom: 20 }}>Your agency hasn't linked your account yet. Reach out to them to get set up!</div>
        <button onClick={handleLogout} style={{ background: "#ff0066", color: "#fff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Sign Out</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#ccc" }}>
      Loading...
    </div>
  );
}
