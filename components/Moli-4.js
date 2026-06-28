"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const hp = "#ff0066";
const hpBg = "rgba(255,0,102,0.12)";
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
  idea:            { color: "#7c3aed", bg: "rgba(124,58,237,0.15)" },
  filming:         { color: "#ea580c", bg: "#fff7ed" },
  uploaded_raw:    { color: "#b45309", bg: "rgba(250,204,21,0.1)" },
  uploaded_edited: { color: "#16a34a", bg: "#f0fdf4" },
  published:       { color: hp,        bg: hpBg      },
  pending:         { color: "#6b6b6b", bg: "#fff0f6" },
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
    platform_notes: c.platform_notes || {},
    profile: c.profile_data || {},
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
  // If id looks like a real UUID use upsert, otherwise insert and let Supabase generate UUID
  const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(client.id);
  if (isRealUUID) {
    const { error } = await supabase.from("clients").upsert({
      id: client.id, name: client.name, handle: client.handle,
      niche: client.niche, avatar: client.avatar, color: client.color,
      agency_cut: client.earnings?.agencyCut||20,
      agency_name: client.earnings?.agencyName||"Your Agency",
    });
    if (error) console.error("saveClient upsert:", error);
    return client.id;
  } else {
    const { data, error } = await supabase.from("clients").insert({
      name: client.name, handle: client.handle,
      niche: client.niche, avatar: client.avatar, color: client.color,
      agency_cut: client.earnings?.agencyCut||20,
      agency_name: client.earnings?.agencyName||"Your Agency",
    }).select().single();
    if (error) { console.error("saveClient insert:", error); return null; }
    return data.id;
  }
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
  const v = { primary:{background:hp,color:"#ffffff"}, outline:{background:"transparent",color:hp,border:`1.5px solid ${hp}`}, ghost:{background:"transparent",color:"#6b6b6b",border:"1px solid #e8e8e8"}, danger:{background:"transparent",color:"#dc2626",border:"1px solid #fca5a5"}, purple:{background:"#7c3aed",color:"#ffffff"} };
  return <button onClick={onClick} disabled={disabled} style={{...base,...v[variant]}}>{children}</button>;
}

const labelSt = { fontSize:10, fontWeight:800, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 };
const inputSt = { width:"100%", background:"#ffffff", border:"1.5px solid #f8b4ce", borderRadius:10, padding:"9px 12px", color:"#0a0a0a", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box" };

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
    <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"16px 28px" }}>
      <div style={{ maxWidth:960, margin:"0 auto", display:"grid", gridTemplateColumns:`repeat(${stats.length}, 1fr)`, gap:12 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background:hp, borderRadius:12, padding:"14px 16px", border:"none", textAlign:"center" }}>
            <div style={{ fontSize:20, marginBottom:6 }}>{s.emoji}</div>
            <div style={{ fontSize:24, fontWeight:700, color:"#fff", lineHeight:1 }}>{s.value}</div>
            <div style={{ fontSize:11, color:"rgba(255,255,255,0.8)", marginTop:4 }}>{s.label}</div>
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
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.2)", zIndex:100, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:"#ffffff", borderRadius:20, padding:28, width:"100%", maxWidth:wide?700:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 8px 48px rgba(255,0,102,0.15)" }}>
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

function AgencyDashboard({ clients, onSelectClient, onAddClient, onLogout, userInfo }) {
  const allIdeas = clients.flatMap(c=>c.ideas);
  const pending = allIdeas.filter(i=>i.status==="pending").length;
  const [unassigned, setUnassigned] = useState([]);
  const [assigningId, setAssigningId] = useState(null);
  const [assignClientId, setAssignClientId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [earningsView, setEarningsView] = useState("month");
  const [sidebarTab, setSidebarTab] = useState("dashboard");
  const [allBrands, setAllBrands] = useState([]);
  const [brandsLoading, setBrandsLoading] = useState(false);
  const [showAddBrand, setShowAddBrand] = useState(false);
  const [brandForm, setBrandForm] = useState({ brand_name:"", website:"", pr_email:"", pr_contact:"", niches:[], actively_sponsoring:false });
  const [savingBrand, setSavingBrand] = useState(false);
  const [todos, setTodos] = useState([]);
  const [todoForm, setTodoForm] = useState({ text:"", date:"", creator:"" });
  const [showTodoForm, setShowTodoForm] = useState(false);
  const [brandNicheFilter, setBrandNicheFilter] = useState("all");
  const [brandSponsorFilter, setBrandSponsorFilter] = useState("all");
  const [brandSearch, setBrandSearch] = useState("");
  const [editingBrand, setEditingBrand] = useState(null);
  const [customNiche, setCustomNiche] = useState("");
  const [customNicheEdit, setCustomNicheEdit] = useState("");

  const ALL_NICHES_LIST = ["beauty","makeup","skincare","fashion","lifestyle","haircare","home","fitness","wellness","travel","food","cooking","parenting","tech","gaming","finance","interior design","pets","books","photography","comedy","music","sports","clean living"];

  useEffect(() => {
    async function loadUnassigned() {
      if (!userInfo?.id) return;
      const { data } = await supabase.from("user_profiles").select("*").eq("agency_id", userInfo.id).eq("role", "creator").is("client_id", null);
      setUnassigned(data || []);
    }
    loadUnassigned();
  }, [userInfo]);

  useEffect(() => {
    if (sidebarTab !== "brands") return;
    setBrandsLoading(true);
    supabase.from("brands").select("*").order("brand_name").then(({ data }) => {
      setAllBrands(data || []);
      setBrandsLoading(false);
    });
  }, [sidebarTab]);

  useEffect(() => {
    if (!userInfo?.id) return;
    supabase.from("agency_todos").select("*").eq("agency_id", userInfo.id).order("due_date", { ascending: true }).then(({ data }) => {
      setTodos(data || []);
    });
  }, [userInfo]);

  const handleAddTodo = async () => {
    if (!todoForm.text.trim()) return;
    const { data } = await supabase.from("agency_todos").insert({
      agency_id: userInfo.id,
      text: todoForm.text,
      due_date: todoForm.date || null,
      creator_name: todoForm.creator || null,
      done: false,
    }).select().single();
    if (data) setTodos(prev => [...prev, data].sort((a,b) => (a.due_date||"zzzz").localeCompare(b.due_date||"zzzz")));
    setTodoForm({ text:"", date:"", creator:"" });
    setShowTodoForm(false);
  };

  const handleToggleTodo = async (id, done) => {
    await supabase.from("agency_todos").update({ done: !done }).eq("id", id);
    setTodos(prev => prev.map(t => t.id === id ? { ...t, done: !done } : t));
  };

  const handleDeleteTodo = async (id) => {
    await supabase.from("agency_todos").delete().eq("id", id);
    setTodos(prev => prev.filter(t => t.id !== id));
  };

  const handleAssign = async (profileId) => {
    if (!assignClientId) return;
    setAssigning(true);
    const { error } = await supabase.from("user_profiles").update({ client_id: assignClientId }).eq("id", profileId);
    if (error) { console.error("Assign error:", error); alert("Could not assign creator: " + error.message); setAssigning(false); return; }
    const { data } = await supabase.from("user_profiles").select("*").eq("agency_id", userInfo.id).eq("role", "creator").is("client_id", null);
    setUnassigned(data || []);
    setAssigningId(null); setAssignClientId(""); setAssigning(false);
  };

  const handleAddBrandDirect = async () => {
    if (!brandForm.brand_name.trim()) return;
    setSavingBrand(true);
    const { data } = await supabase.from("brands").insert({
      brand_name: brandForm.brand_name,
      website: brandForm.website || null,
      pr_email: brandForm.pr_email || null,
      pr_contact: brandForm.pr_contact || null,
      niches: brandForm.niches,
      actively_sponsoring: brandForm.actively_sponsoring,
    }).select().single();
    if (data) setAllBrands(prev => [...prev, data].sort((a,b)=>a.brand_name.localeCompare(b.brand_name)));
    setBrandForm({ brand_name:"", website:"", pr_email:"", pr_contact:"", niches:[], actively_sponsoring:false });
    setShowAddBrand(false);
    setSavingBrand(false);
  };

  const curMonth = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,"0")}`;
  const clientEarnings = clients.map(c => {
    const entries = c.earnings?.entries || [];
    const deals = c.earnings?.brandDeals || [];
    const cut = c.earnings?.agencyCut || 20;
    const monthAffiliate = entries.filter(e=>e.month===curMonth).reduce((a,e)=>a+Number(e.amount||0),0);
    const monthDeals = deals.filter(d=>d.status==="paid"&&d.month===curMonth).reduce((a,d)=>a+Number(d.amount||0),0);
    const monthTotal = monthAffiliate + monthDeals;
    const allAffiliate = entries.reduce((a,e)=>a+Number(e.amount||0),0);
    const allDeals = deals.filter(d=>d.status==="paid").reduce((a,d)=>a+Number(d.amount||0),0);
    const allTotal = allAffiliate + allDeals;
    const pendingDeals = deals.filter(d=>d.status!=="paid").reduce((a,d)=>a+Number(d.amount||0),0);
    return { id:c.id, name:c.name, handle:c.handle, avatar:c.avatar, color:c.color, monthTotal, monthAgency:monthTotal*(cut/100), allTotal, allAgency:allTotal*(cut/100), pendingDeals, cut };
  });
  const totalMonthGross = clientEarnings.reduce((a,c)=>a+c.monthTotal,0);
  const totalMonthAgency = clientEarnings.reduce((a,c)=>a+c.monthAgency,0);
  const totalAllGross = clientEarnings.reduce((a,c)=>a+c.allTotal,0);
  const totalAllAgency = clientEarnings.reduce((a,c)=>a+c.allAgency,0);
  const totalPending = clientEarnings.reduce((a,c)=>a+c.pendingDeals,0);
  const publishedCount = allIdeas.filter(i=>i.status==="published").length;

  const MoneyCard = ({label,value,sub,color,bg}) => (
    <div style={{ background:bg||"rgba(255,0,102,0.12)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)", flex:1, minWidth:120 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:color||hp, lineHeight:1 }}>{fmtMoney(value)}</div>
      {sub && <div style={{ fontSize:11, color:"#6b6b6b", marginTop:4 }}>{sub}</div>}
    </div>
  );

  const inputStForm = { width:"100%", background:"#ffffff", border:"1.5px solid #f8b4ce", borderRadius:10, padding:"9px 12px", color:"#0a0a0a", fontSize:13, outline:"none", resize:"vertical", boxSizing:"border-box" };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#fdf6f8" }}>
      <Sidebar activeTab={sidebarTab} onNavigate={setSidebarTab} onLogout={onLogout} userInfo={userInfo} clients={clients}/>
      <div style={{ flex:1, overflow:"auto" }}>

        {/* DASHBOARD */}
        {sidebarTab === "dashboard" && (
          <>
            <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"16px 28px" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"#0a0a0a", marginBottom:2 }}>Dashboard</div>
              <div style={{ fontSize:12, color:"#6b6b6b" }}>{new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}{pending>0?` · ${pending} item${pending>1?"s":""} need your attention`:""}</div>
            </div>

            <main style={{ maxWidth:960, margin:"0 auto", padding:"28px 28px" }}>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
                {[
                  { label:"Active Creators", value:clients.length, emoji:"🎬", color:hp, bg:"rgba(255,0,102,0.08)" },
                  { label:"Pending Setup", value:unassigned.length, emoji:"⏳", color:"#b45309", bg:"#fefce8" },
                  { label:"Published", value:publishedCount, emoji:"🚀", color:"#16a34a", bg:"#f0fdf4" },
                  { label:"Awaiting Approval", value:pending, emoji:"👀", color:"#7c3aed", bg:"#f5f0ff" },
                ].map(s => (
                  <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:"16px 20px", flex:1, minWidth:120, textAlign:"center", border:`1px solid ${s.color}20` }}>
                    <div style={{ fontSize:24, marginBottom:6 }}>{s.emoji}</div>
                    <div style={{ fontSize:26, fontWeight:800, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:11, color:"#6b6b6b", marginTop:4 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ background:"#ffffff", borderRadius:18, border:"1px solid var(--border)", padding:"20px 24px", marginBottom:24 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:10 }}>
                  <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#0a0a0a" }}>Agency Earnings</div>
                  <div style={{ display:"flex", gap:8 }}>
                    {["month","alltime"].map(v=>(
                      <button key={v} onClick={()=>setEarningsView(v)} style={{ padding:"6px 14px", borderRadius:20, border:`1.5px solid ${earningsView===v?hp:border}`, background:earningsView===v?"rgba(255,0,102,0.08)":"transparent", color:earningsView===v?hp:"#999", fontWeight:700, fontSize:12, cursor:"pointer" }}>{v==="month"?"This Month":"All Time"}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                  <MoneyCard label={earningsView==="month"?"Gross (Month)":"Gross (All Time)"} value={earningsView==="month"?totalMonthGross:totalAllGross} sub="Across all creators" color={hp} bg="rgba(255,0,102,0.08)"/>
                  <MoneyCard label={earningsView==="month"?"Agency Cut (Month)":"Agency Cut (All Time)"} value={earningsView==="month"?totalMonthAgency:totalAllAgency} sub="Your commission" color="#7c3aed" bg="#f5f0ff"/>
                  <MoneyCard label="Pending Deals" value={totalPending} sub="Awaiting payment" color="#b45309" bg="#fefce8"/>
                </div>
              </div>

              <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
                {/* Content Tracker */}
                <div style={{ background:"#ffffff", borderRadius:18, border:"1px solid var(--border)", padding:"20px 24px", flex:2, minWidth:280 }}>
                  <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#0a0a0a", marginBottom:16 }}>Content Tracker</div>
                  <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                    {Object.entries(STATUS_CONFIG).map(([k,v]) => {
                      const count = allIdeas.filter(i=>i.status===k).length;
                      return (
                        <div key={k} style={{ background:STATUS_COLORS[k].bg, borderRadius:12, padding:"12px 16px", flex:1, minWidth:80, textAlign:"center", border:`1px solid ${STATUS_COLORS[k].color}30` }}>
                          <div style={{ fontSize:18, marginBottom:4 }}>{v.emoji}</div>
                          <div style={{ fontSize:18, fontWeight:800, color:STATUS_COLORS[k].color }}>{count}</div>
                          <div style={{ fontSize:10, color:"#6b6b6b", marginTop:2 }}>{v.label}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* To-Do / Meetups */}
                <div style={{ background:"#ffffff", borderRadius:18, border:"1px solid var(--border)", padding:"20px 24px", flex:1, minWidth:260 }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
                    <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#0a0a0a" }}>To-Do & Meetups</div>
                    <button onClick={()=>setShowTodoForm(f=>!f)} style={{ background:hp, color:"#fff", border:"none", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Add</button>
                  </div>
                  {showTodoForm && (
                    <div style={{ background:"#fdf6f8", borderRadius:12, padding:"12px 14px", marginBottom:14, display:"flex", flexDirection:"column", gap:8 }}>
                      <input value={todoForm.text} onChange={e=>setTodoForm(f=>({...f,text:e.target.value}))} placeholder="e.g. Monthly check-in with Gabby" style={{ ...inputStForm, padding:"7px 10px" }}/>
                      <div style={{ display:"flex", gap:8 }}>
                        <input type="date" value={todoForm.date} onChange={e=>setTodoForm(f=>({...f,date:e.target.value}))} style={{ ...inputStForm, flex:1, padding:"7px 10px" }}/>
                        <select value={todoForm.creator} onChange={e=>setTodoForm(f=>({...f,creator:e.target.value}))} style={{ ...inputStForm, flex:1, padding:"7px 10px" }}>
                          <option value="">All creators</option>
                          {clients.map(c=><option key={c.id} value={c.name}>{c.name}</option>)}
                        </select>
                      </div>
                      <div style={{ display:"flex", gap:8 }}>
                        <button onClick={()=>setShowTodoForm(false)} style={{ flex:1, background:"transparent", border:"1px solid #f0d0dc", borderRadius:8, padding:"6px", fontSize:12, cursor:"pointer", color:"#999" }}>Cancel</button>
                        <button onClick={handleAddTodo} style={{ flex:2, background:hp, border:"none", borderRadius:8, padding:"6px", fontSize:12, fontWeight:700, cursor:"pointer", color:"#fff" }}>Save</button>
                      </div>
                    </div>
                  )}
                  <div style={{ display:"flex", flexDirection:"column", gap:8, maxHeight:260, overflowY:"auto" }}>
                    {todos.length===0 && <div style={{ fontSize:13, color:"#b0b0b0", textAlign:"center", padding:"20px 0" }}>No tasks yet — add a meetup or reminder</div>}
                    {todos.map(t => (
                      <div key={t.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"10px 12px", background:t.done?"#f9f9f9":"#fff0f6", borderRadius:10, border:`1px solid ${t.done?"#e8e8e8":"#f8b4ce"}`, opacity:t.done?0.6:1 }}>
                        <input type="checkbox" checked={t.done} onChange={()=>handleToggleTodo(t.id,t.done)} style={{ marginTop:2, accentColor:hp, cursor:"pointer" }}/>
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:"#0a0a0a", textDecoration:t.done?"line-through":"none" }}>{t.text}</div>
                          <div style={{ display:"flex", gap:8, marginTop:3, flexWrap:"wrap" }}>
                            {t.due_date && <span style={{ fontSize:11, color:"#7c3aed" }}>📅 {new Date(t.due_date+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                            {t.creator_name && <span style={{ fontSize:11, color:hp }}>👤 {t.creator_name}</span>}
                          </div>
                        </div>
                        <button onClick={()=>handleDeleteTodo(t.id)} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:14, flexShrink:0 }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </main>
          </>
        )}

        {/* CREATORS */}
        {sidebarTab === "creators" && (
          <>
            <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:"#0a0a0a", marginBottom:2 }}>Creators</div>
                <div style={{ fontSize:12, color:"#6b6b6b" }}>{clients.length} active · {unassigned.length} pending setup</div>
              </div>
              <Btn small onClick={onAddClient}>+ Add Creator</Btn>
            </div>
            <main style={{ maxWidth:960, margin:"0 auto", padding:"28px 28px" }}>
              {unassigned.length > 0 && (
                <div style={{ background:"#ffffff", borderRadius:16, border:"1.5px solid #fde047", padding:"18px 20px", marginBottom:24 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:14 }}>
                    <span style={{ fontSize:20 }}>⏳</span>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>{unassigned.length} creator{unassigned.length>1?"s":""} waiting to be assigned</div>
                      <div style={{ fontSize:12, color:"#6b6b6b" }}>Signed up with your agency code but not linked to a board yet</div>
                    </div>
                  </div>
                  <div style={{ display:"grid", gap:10 }}>
                    {unassigned.map(u => (
                      <div key={u.id} style={{ background:"#fefce8", borderRadius:12, padding:"12px 16px", border:"1px solid #fde047" }}>
                        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                          <div>
                            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{u.display_name || "Creator"}</div>
                            <div style={{ fontSize:12, color:"#6b6b6b" }}>{u.email}</div>
                          </div>
                          {assigningId === u.id ? (
                            <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                              <select value={assignClientId} onChange={e=>setAssignClientId(e.target.value)} style={{ ...inputSt, width:"auto", padding:"7px 12px", fontSize:13 }}>
                                <option value="">Select a board...</option>
                                {clients.map(c=><option key={c.id} value={c.id}>{c.name} · {c.handle}</option>)}
                              </select>
                              <Btn small onClick={()=>handleAssign(u.id)} disabled={!assignClientId||assigning}>{assigning?"Saving...":"Assign"}</Btn>
                              <Btn small variant="ghost" onClick={()=>{setAssigningId(null);setAssignClientId("");}}>Cancel</Btn>
                            </div>
                          ) : (
                            <Btn small onClick={()=>{setAssigningId(u.id);setAssignClientId("");}}>Assign to Board →</Btn>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div style={{ fontFamily:"Georgia,serif", fontSize:22, color:"#0a0a0a", marginBottom:16 }}>Your Creators</div>
              <div style={{ display:"grid", gap:14 }}>
                {clients.map(client => {
                  const counts = Object.keys(STATUS_CONFIG).reduce((a,k)=>{a[k]=client.ideas.filter(i=>i.status===k).length;return a;},{});
                  const hasUrgent = counts.uploaded_raw>0 || counts.pending>0;
                  return (
                    <div key={client.id} onClick={()=>onSelectClient(client.id)} style={{ background:"#ffffff", borderRadius:18, border:`1.5px solid ${hasUrgent?hp:"#f0d0dc"}`, padding:"20px 24px", cursor:"pointer", boxShadow:hasUrgent?"0 4px 20px rgba(255,0,102,0.10)":"0 2px 12px rgba(255,0,102,0.04)", transition:"all 0.2s", display:"flex", alignItems:"center", gap:18 }}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=hp;e.currentTarget.style.transform="translateY(-2px)";}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=hasUrgent?hp+"60":border;e.currentTarget.style.transform="translateY(0)";}}>
                      <Avatar letter={client.avatar} color={client.color} size={52}/>
                      <div style={{ flex:1 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                          <div style={{ fontWeight:800, fontSize:16, color:"#0a0a0a" }}>{client.name}</div>
                          <div style={{ fontSize:12, color:"#6b6b6b" }}>{client.handle}</div>
                          {counts.pending>0 && <span style={{ background:"#fff0f6", color:"#6b6b6b", borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700 }}>⏳ {counts.pending} pending</span>}
                          {counts.uploaded_raw>0 && <span style={{ background:"rgba(255,0,102,0.08)", color:hp, borderRadius:20, padding:"2px 8px", fontSize:11, fontWeight:700 }}>⚡ {counts.uploaded_raw} needs edit</span>}
                        </div>
                        <div style={{ fontSize:13, color:"#6b6b6b", marginBottom:10 }}>{client.niche}</div>
                        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                          {Object.entries(counts).filter(([,v])=>v>0).map(([k,v])=>(
                            <span key={k} style={{ background:STATUS_COLORS[k].bg, color:STATUS_COLORS[k].color, borderRadius:20, padding:"2px 10px", fontSize:11, fontWeight:600 }}>{STATUS_CONFIG[k].emoji} {v} {STATUS_CONFIG[k].label}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{ color:"#b0b0b0", fontSize:20 }}>→</div>
                    </div>
                  );
                })}
              </div>
            </main>
          </>
        )}

        {/* EARNINGS */}
        {sidebarTab === "earnings" && (
          <>
            <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"16px 28px" }}>
              <div style={{ fontSize:18, fontWeight:700, color:"#0a0a0a", marginBottom:2 }}>Earnings</div>
              <div style={{ fontSize:12, color:"#6b6b6b" }}>Agency-wide earnings overview</div>
            </div>
            <main style={{ maxWidth:960, margin:"0 auto", padding:"28px 28px" }}>
              <div style={{ display:"flex", gap:12, flexWrap:"wrap", marginBottom:24 }}>
                <MoneyCard label="Total Gross (All Time)" value={totalAllGross} sub="Across all creators" color={hp} bg="rgba(255,0,102,0.08)"/>
                <MoneyCard label="Agency Cut (All Time)" value={totalAllAgency} sub="Your commission" color="#7c3aed" bg="#f5f0ff"/>
                <MoneyCard label="Pending Deals" value={totalPending} sub="Awaiting payment" color="#b45309" bg="#fefce8"/>
              </div>
              <div style={{ display:"grid", gap:16 }}>
                {clientEarnings.filter(c=>c.allTotal>0||c.pendingDeals>0).map(c => (
                  <div key={c.id} onClick={()=>onSelectClient(c.id)} style={{ background:"#ffffff", borderRadius:12, border:"1px solid var(--border)", padding:"16px 20px", cursor:"pointer", display:"flex", alignItems:"center", gap:14, transition:"all 0.15s" }}
                    onMouseEnter={e=>e.currentTarget.style.borderColor=hp}
                    onMouseLeave={e=>e.currentTarget.style.borderColor="var(--border)"}>
                    <Avatar letter={c.avatar} color={c.color} size={44}/>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:600, color:"#0a0a0a", fontSize:14 }}>{c.name}</div>
                      <div style={{ fontSize:12, color:"#6b6b6b" }}>{c.handle}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:18, fontWeight:700, color:"#0a0a0a" }}>{fmtMoney(c.allTotal)}</div>
                      <div style={{ fontSize:12, color:hp }}>Agency: {fmtMoney(c.allAgency)}</div>
                      {c.pendingDeals>0 && <div style={{ fontSize:11, color:"#b45309" }}>{fmtMoney(c.pendingDeals)} pending</div>}
                    </div>
                  </div>
                ))}
                {clientEarnings.every(c=>c.allTotal===0&&c.pendingDeals===0) && (
                  <div style={{ textAlign:"center", padding:"60px", color:"#b0b0b0" }}>
                    <div style={{ fontSize:32, marginBottom:12 }}>💰</div>
                    <div>No earnings tracked yet</div>
                  </div>
                )}
              </div>
            </main>
          </>
        )}

        {/* BRANDS */}
        {sidebarTab === "brands" && (
          <>
            <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"16px 28px", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <div style={{ fontSize:18, fontWeight:700, color:"#0a0a0a", marginBottom:2 }}>Brand Directory</div>
                <div style={{ fontSize:12, color:"#6b6b6b" }}>{allBrands.length} brands in your directory</div>
              </div>
              <Btn small onClick={()=>setShowAddBrand(true)}>+ Add Brand</Btn>
            </div>
            {/* Filters */}
            <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"12px 28px", display:"flex", gap:10, flexWrap:"wrap", alignItems:"center" }}>
              <input value={brandSearch} onChange={e=>setBrandSearch(e.target.value)} placeholder="Search brands..." style={{ background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:8, padding:"7px 12px", fontSize:13, outline:"none", width:180, color:"#0a0a0a" }}/>
              <select value={brandNicheFilter} onChange={e=>setBrandNicheFilter(e.target.value)} style={{ background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:8, padding:"7px 12px", fontSize:13, color:"#0a0a0a", cursor:"pointer" }}>
                <option value="all">All niches</option>
                {ALL_NICHES_LIST.map(n=><option key={n} value={n}>{n.charAt(0).toUpperCase()+n.slice(1)}</option>)}
              </select>
              <select value={brandSponsorFilter} onChange={e=>setBrandSponsorFilter(e.target.value)} style={{ background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:8, padding:"7px 12px", fontSize:13, color:"#0a0a0a", cursor:"pointer" }}>
                <option value="all">All brands</option>
                <option value="yes">Actively sponsoring</option>
                <option value="no">Not confirmed</option>
              </select>
              <span style={{ fontSize:12, color:"#b0b0b0", marginLeft:"auto" }}>
                {allBrands.filter(b => {
                  const niches = Array.isArray(b.niches)?b.niches:(typeof b.niches==="string"?JSON.parse(b.niches||"[]"):[]);
                  const matchNiche = brandNicheFilter==="all"||niches.includes(brandNicheFilter);
                  const matchSponsor = brandSponsorFilter==="all"||(brandSponsorFilter==="yes"&&b.actively_sponsoring)||(brandSponsorFilter==="no"&&!b.actively_sponsoring);
                  const matchSearch = !brandSearch||b.brand_name.toLowerCase().includes(brandSearch.toLowerCase());
                  return matchNiche&&matchSponsor&&matchSearch;
                }).length} results
              </span>
            </div>
            <main style={{ maxWidth:960, margin:"0 auto", padding:"28px 28px" }}>
              {brandsLoading ? (
                <div style={{ textAlign:"center", padding:"60px", color:"#b0b0b0" }}>Loading brands...</div>
              ) : (
                <div style={{ display:"grid", gap:10 }}>
                  {allBrands.filter(b => {
                    const niches = Array.isArray(b.niches)?b.niches:(typeof b.niches==="string"?JSON.parse(b.niches||"[]"):[]);
                    const matchNiche = brandNicheFilter==="all"||niches.includes(brandNicheFilter);
                    const matchSponsor = brandSponsorFilter==="all"||(brandSponsorFilter==="yes"&&b.actively_sponsoring)||(brandSponsorFilter==="no"&&!b.actively_sponsoring);
                    const matchSearch = !brandSearch||b.brand_name.toLowerCase().includes(brandSearch.toLowerCase());
                    return matchNiche&&matchSponsor&&matchSearch;
                  }).map(b => {
                    const niches = Array.isArray(b.niches) ? b.niches : (typeof b.niches==="string" ? JSON.parse(b.niches||"[]") : []);
                    return (
                      <div key={b.id} style={{ background:"#ffffff", borderRadius:14, border:"1.5px solid #f0d0dc", padding:"16px 20px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                        <div style={{ flex:1, minWidth:160 }}>
                          <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{b.brand_name}</div>
                          <div style={{ fontSize:12, color:"#b0b0b0", marginTop:2 }}>{b.website}</div>
                          <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>
                            {niches.map(n=><span key={n} style={{ fontSize:10, fontWeight:700, background:"rgba(255,0,102,0.08)", color:hp, borderRadius:20, padding:"2px 8px", textTransform:"uppercase" }}>{n}</span>)}
                            {b.actively_sponsoring && <span style={{ fontSize:10, fontWeight:700, background:"rgba(22,163,74,0.1)", color:"#16a34a", borderRadius:20, padding:"2px 8px" }}>✓ Sponsoring</span>}
                          </div>
                        </div>
                        {b.pr_email && <div style={{ fontSize:12, color:"#7c3aed", fontFamily:"monospace" }}>{b.pr_email}</div>}
                        {b.pr_contact && <div style={{ fontSize:12, color:"#6b6b6b" }}>{b.pr_contact}</div>}
                        <button onClick={()=>setEditingBrand({...b, niches: Array.isArray(b.niches)?b.niches:(typeof b.niches==="string"?JSON.parse(b.niches||"[]"):[])})} style={{ background:"transparent", border:"1.5px solid #f0d0dc", borderRadius:8, padding:"5px 12px", fontSize:12, fontWeight:700, color:hp, cursor:"pointer", flexShrink:0 }}>Edit</button>
                      </div>
                    );
                  })}
                  {allBrands.length===0 && (
                    <div style={{ textAlign:"center", padding:"60px", color:"#b0b0b0" }}>
                      <div style={{ fontSize:32, marginBottom:12 }}>🏷️</div>
                      <div>No brands yet — add your first one above</div>
                    </div>
                  )}
                </div>
              )}
            </main>
            {showAddBrand && (
              <Modal onClose={()=>setShowAddBrand(false)} title="Add Brand">
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div><label style={labelSt}>Brand Name *</label><input value={brandForm.brand_name} onChange={e=>setBrandForm(f=>({...f,brand_name:e.target.value}))} placeholder="e.g. Glossier" style={inputStForm}/></div>
                  <div><label style={labelSt}>Website</label><input value={brandForm.website} onChange={e=>setBrandForm(f=>({...f,website:e.target.value}))} placeholder="e.g. glossier.com" style={inputStForm}/></div>
                  <div><label style={labelSt}>PR Email</label><input value={brandForm.pr_email} onChange={e=>setBrandForm(f=>({...f,pr_email:e.target.value}))} placeholder="e.g. pr@glossier.com" style={inputStForm}/></div>
                  <div><label style={labelSt}>PR Contact Name</label><input value={brandForm.pr_contact} onChange={e=>setBrandForm(f=>({...f,pr_contact:e.target.value}))} placeholder="e.g. Jane Smith (Director of PR)" style={inputStForm}/></div>
                  <div>
                    <label style={labelSt}>Niches</label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginBottom:8 }}>
                      {[...ALL_NICHES_LIST, ...brandForm.niches.filter(n=>!ALL_NICHES_LIST.includes(n))].map(n=>(
                        <button key={n} onClick={()=>setBrandForm(f=>({ ...f, niches: f.niches.includes(n)?f.niches.filter(x=>x!==n):[...f.niches,n] }))} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", background:brandForm.niches.includes(n)?hp:"transparent", color:brandForm.niches.includes(n)?"#fff":"#999", border:`1.5px solid ${brandForm.niches.includes(n)?hp:"#f0d0dc"}` }}>{n}</button>
                      ))}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:6 }}>
                      <input value={customNiche} onChange={e=>setCustomNiche(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&customNiche.trim()){ setBrandForm(f=>({...f,niches:[...f.niches,customNiche.trim().toLowerCase()]})); setCustomNiche(""); }}} placeholder="Add custom niche..." style={{ flex:1, background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:8, padding:"6px 10px", fontSize:12, outline:"none", color:"#0a0a0a" }}/>
                      <button onClick={()=>{ if(customNiche.trim()){ setBrandForm(f=>({...f,niches:[...f.niches,customNiche.trim().toLowerCase()]})); setCustomNiche(""); }}} style={{ background:hp, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Add</button>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <input type="checkbox" id="sponsoring" checked={brandForm.actively_sponsoring} onChange={e=>setBrandForm(f=>({...f,actively_sponsoring:e.target.checked}))} style={{ width:16, height:16, accentColor:hp }}/>
                    <label htmlFor="sponsoring" style={{ fontSize:13, color:"#0a0a0a", cursor:"pointer" }}>Actively sponsoring creators</label>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:4 }}>
                    <Btn variant="ghost" onClick={()=>setShowAddBrand(false)} style={{ flex:1 }}>Cancel</Btn>
                    <Btn onClick={handleAddBrandDirect} disabled={savingBrand||!brandForm.brand_name.trim()} style={{ flex:2 }}>{savingBrand?"Saving...":"Add Brand"}</Btn>
                  </div>
                </div>
              </Modal>
            )}
            {editingBrand && (
              <Modal onClose={()=>setEditingBrand(null)} title={`Edit ${editingBrand.brand_name}`}>
                <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
                  <div>
                    <label style={labelSt}>Niches</label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:6, marginBottom:8 }}>
                      {[...ALL_NICHES_LIST, ...editingBrand.niches.filter(n=>!ALL_NICHES_LIST.includes(n))].map(n => {
                        const active = editingBrand.niches.includes(n);
                        return (
                          <button key={n} onClick={()=>{
                            const updated = active ? editingBrand.niches.filter(x=>x!==n) : [...editingBrand.niches, n];
                            setEditingBrand(b=>({...b, niches: updated}));
                          }} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", background:active?hp:"transparent", color:active?"#fff":"#999", border:`1.5px solid ${active?hp:"#f0d0dc"}` }}>
                            {n}
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", gap:8, marginTop:6 }}>
                      <input value={customNicheEdit} onChange={e=>setCustomNicheEdit(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&customNicheEdit.trim()){ setEditingBrand(b=>({...b,niches:[...b.niches,customNicheEdit.trim().toLowerCase()]})); setCustomNicheEdit(""); }}} placeholder="Add custom niche..." style={{ flex:1, background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:8, padding:"6px 10px", fontSize:12, outline:"none", color:"#0a0a0a" }}/>
                      <button onClick={()=>{ if(customNicheEdit.trim()){ setEditingBrand(b=>({...b,niches:[...b.niches,customNicheEdit.trim().toLowerCase()]})); setCustomNicheEdit(""); }}} style={{ background:hp, color:"#fff", border:"none", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, cursor:"pointer" }}>+ Add</button>
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <input type="checkbox" id="edit-sponsoring" checked={editingBrand.actively_sponsoring||false}
                      onChange={e=>setEditingBrand(b=>({...b,actively_sponsoring:e.target.checked}))}
                      style={{ width:16, height:16, accentColor:hp }}/>
                    <label htmlFor="edit-sponsoring" style={{ fontSize:13, color:"#0a0a0a", cursor:"pointer" }}>Actively sponsoring creators</label>
                  </div>
                  <div style={{ display:"flex", gap:10, marginTop:4 }}>
                    <Btn variant="ghost" onClick={()=>setEditingBrand(null)} style={{ flex:1 }}>Cancel</Btn>
                    <Btn onClick={async ()=>{
                      await supabase.from("brands").update({
                        niches: editingBrand.niches,
                        actively_sponsoring: editingBrand.actively_sponsoring,
                      }).eq("id", editingBrand.id);
                      setAllBrands(prev => prev.map(b => b.id===editingBrand.id ? {...b, niches:editingBrand.niches, actively_sponsoring:editingBrand.actively_sponsoring} : b));
                      setEditingBrand(null);
                    }} style={{ flex:2 }}>Save Changes</Btn>
                  </div>
                </div>
              </Modal>
            )}
          </>
        )}

      </div>
    </div>
  );
}

function Sidebar({ activeTab, onNavigate, onLogout, userInfo, clients }) {
  const navItems = [
    { key:"dashboard", icon:"ti-layout-dashboard", label:"Dashboard" },
    { key:"creators",  icon:"ti-users",            label:"Creators" },
    { key:"earnings",  icon:"ti-coins",            label:"Earnings" },
    { key:"brands",    icon:"ti-building-store",   label:"Brands" },
  ];
  const initials = userInfo?.name ? userInfo.name.split(" ").map(n=>n[0]).join("").slice(0,2).toUpperCase() : "AG";

  return (
    <div style={{ width:200, background:"#ff0066", borderRight:"none", padding:"24px 12px", display:"flex", flexDirection:"column", flexShrink:0, minHeight:"100vh", position:"sticky", top:0, height:"100vh" }}>
      <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#ffffff", padding:"0 8px", marginBottom:32, letterSpacing:-0.5 }}>
        <span style={{ color:"#fff" }}>✦</span> <span style={{ color:"#fff" }}>Moli</span>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
        {navItems.map(item => (
          <button key={item.key} onClick={()=>onNavigate(item.key)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:8, fontSize:13, color:"#fff", background:activeTab===item.key?"rgba(255,255,255,0.2)":"transparent", fontWeight:activeTab===item.key?700:400, border:"none", cursor:"pointer", textAlign:"left", transition:"all 0.15s", width:"100%" }}
            onMouseEnter={e=>{ if(activeTab!==item.key) e.currentTarget.style.background="rgba(255,255,255,0.15)"; }}
            onMouseLeave={e=>{ if(activeTab!==item.key) e.currentTarget.style.background="transparent"; }}
          >
            <i className={`ti ${item.icon}`} style={{ fontSize:16 }} aria-hidden="true"/>
            {item.label}
          </button>
        ))}
      </div>
      <div style={{ flex:1 }}/>
      <button onClick={onLogout} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 10px", borderRadius:8, fontSize:13, color:"rgba(255,255,255,0.7)", background:"transparent", border:"none", cursor:"pointer", marginBottom:12, textAlign:"left", width:"100%" }}>
        <i className="ti ti-logout" style={{ fontSize:16 }} aria-hidden="true"/>
        Sign out
      </button>
      <div style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 10px 0", borderTop:"1px solid rgba(255,255,255,0.2)" }}>
        <div style={{ width:30, height:30, borderRadius:"50%", background:"rgba(255,255,255,0.25)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#fff", fontWeight:700, flexShrink:0 }}>{initials}</div>
        <div>
          <div style={{ fontSize:12, color:"#fff", lineHeight:1.2, fontWeight:600 }}>{userInfo?.name||userInfo?.agencyName||"Agency"}</div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.7)" }}>Agency</div>
        </div>
      </div>
    </div>
  );
}

function Header({ title, left, right }) {
  return (
    <header style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16 }}>
      <div style={{ display:"flex", alignItems:"center", gap:16 }}>
        {left}
        {title && <span style={{ fontSize:14, color:"#6b6b6b", fontWeight:500 }}>{title}</span>}
      </div>
      <div style={{ display:"flex", gap:10, alignItems:"center" }}>{right}</div>
    </header>
  );
}

// ─────────────────────────────────────────────
// ADD CLIENT MODAL
// ─────────────────────────────────────────────

function AddClientModal({ onAdd, onClose, agencyCode }) {
  const [form, setForm] = useState({ name:"", handle:"", niche:"", color:"#ff0066" });
  const [added, setAdded] = useState(null);
  const [copied, setCopied] = useState(false);
  const colors = ["#ff0066","#7c3aed","#0ea5e9","#16a34a","#ea580c","#b45309"];

  const siteUrl = typeof window !== "undefined" ? window.location.origin : "";

  const handleAdd = () => {
    if (!form.name.trim()) return;
    const client = {
      id: "client-" + Date.now(),
      name: form.name,
      handle: form.handle || "@" + form.name.toLowerCase().replace(/\s/g, ""),
      niche: form.niche,
      avatar: form.name[0].toUpperCase(),
      color: form.color,
      ideas: [],
    };
    onAdd(client);
    setAdded(client);
  };

  const inviteMessage = `Hi ${added?.name}! Your agency has set up your Moli workspace.\n\n1. Go to: ${siteUrl}\n2. Click "Sign up" → "Creator"\n3. Enter your email, create a password\n4. Use agency code: ${agencyCode}\n\nYou'll have access to your content board right away!`;

  const copyInvite = () => {
    navigator.clipboard.writeText(inviteMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (added) return (
    <Modal onClose={onClose} title="Client Added!">
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ background:"#f0fdf4", border:"1px solid #86efac", borderRadius:12, padding:"14px 16px", display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:44, height:44, borderRadius:"50%", background:added.color+"20", color:added.color, display:"flex", alignItems:"center", justifyContent:"center", fontWeight:800, fontSize:18, flexShrink:0 }}>{added.avatar}</div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>{added.name} has been added!</div>
            <div style={{ fontSize:12, color:"#6b6b6b" }}>{added.handle}</div>
          </div>
        </div>

        <div>
          <div style={{ fontSize:13, fontWeight:700, color:"#0a0a0a", marginBottom:8 }}>Send this invite to {added.name}:</div>
          <div style={{ background:"#fdf6f8", border:"1px solid var(--border)", borderRadius:10, padding:"12px 14px", fontSize:13, color:"#6b6b6b", lineHeight:1.7, whiteSpace:"pre-wrap" }}>
            {inviteMessage}
          </div>
        </div>

        <div style={{ background:hpBg, border:`1px dashed ${hp}`, borderRadius:10, padding:"10px 14px", fontSize:13 }}>
          <span style={{ fontWeight:700, color:hp }}>Agency Code: </span>
          <span style={{ fontFamily:"monospace", letterSpacing:2, fontWeight:700, color:"#0a0a0a" }}>{agencyCode}</span>
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <Btn variant="outline" onClick={copyInvite} style={{ flex:1 }}>{copied ? "✓ Copied!" : "Copy Invite"}</Btn>
          <Btn onClick={onClose} style={{ flex:1 }}>Done</Btn>
        </div>
      </div>
    </Modal>
  );

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
        <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:10, padding:"10px 14px", fontSize:12, color:"#b45309" }}>
          After adding, you'll get a ready-to-send invite message with your agency code for the creator to sign up.
        </div>
        <div style={{ display:"flex", gap:10, marginTop:6 }}>
          <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
          <Btn onClick={handleAdd} style={{ flex:2 }}>+ Add Client</Btn>
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
    const a = document.createElement("a"); a.href=url; a.download="moli-ideas-template.csv"; a.click();
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
            <div style={{ fontSize:12, color:"#6b6b6b", marginTop:2 }}>Fill it in with your ideas, then upload below</div>
          </div>
          <Btn variant="outline" small onClick={downloadTemplate}>⬇ Download Template</Btn>
        </div>
        <div>
          <label style={labelSt}>Step 2 — Upload your filled CSV</label>
          <div onDragOver={e=>{e.preventDefault();}} onDrop={e=>{e.preventDefault();handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>document.getElementById("csv-input").click()}
            style={{ border:`2px dashed ${border}`, borderRadius:12, padding:"24px", textAlign:"center", cursor:"pointer", background:"#fdf6f8" }}>
            <div style={{ fontSize:28, marginBottom:6 }}>📄</div>
            <div style={{ fontSize:13, color:"#6b6b6b" }}>Drop CSV here or tap to browse</div>
            <input id="csv-input" type="file" accept=".csv" style={{ display:"none" }} onChange={e=>handleFile(e.target.files[0])}/>
          </div>
          {error && <div style={{ color:"#dc2626", fontSize:12, marginTop:6 }}>{error}</div>}
        </div>
        {preview.length>0 && (
          <div>
            <label style={labelSt}>Preview — {preview.length} ideas found</label>
            <div style={{ maxHeight:200, overflowY:"auto", border:"1px solid var(--border)", borderRadius:10 }}>
              {preview.map((r,i)=>(
                <div key={i} style={{ padding:"10px 14px", borderBottom:"1px solid var(--border)", fontSize:13 }}>
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
      <div style={{ background:"#fdf6f8", border:"1.5px solid #f8b4ce", borderRadius:12, overflow:"hidden" }}>
        <div style={{ maxHeight:180, overflowY:"auto", padding:"12px 14px", display:"flex", flexDirection:"column", gap:8 }}>
          {thread.length===0 && <div style={{ fontSize:12, color:"#b0b0b0", textAlign:"center", padding:"12px 0" }}>No messages yet</div>}
          {thread.map((m,i)=>{
            const isMe = m.from===role;
            return (
              <div key={i} style={{ display:"flex", justifyContent:isMe?"flex-end":"flex-start" }}>
                <div style={{ maxWidth:"80%", background:isMe?hp:"#ffffff", color:isMe?"#ffffff":"#0a0a0a", borderRadius:isMe?"14px 14px 4px 14px":"14px 14px 14px 4px", padding:"8px 12px", fontSize:13, border:isMe?"none":`1px solid ${border}`, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
                  <div style={{ fontSize:10, fontWeight:700, opacity:0.6, marginBottom:3 }}>{m.from==="agency"?"🏢 Agency":"🎬 Creator"} · {m.time}</div>
                  {m.text}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef}/>
        </div>
        <div style={{ borderTop:"1px solid var(--border)", display:"flex" }}>
          <input value={msg} onChange={e=>setMsg(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&msg.trim()){ onSend(msg.trim()); setMsg(""); }}} placeholder="Add a note..." style={{ flex:1, border:"none", padding:"10px 14px", fontSize:13, outline:"none", background:"transparent" }}/>
          <button onClick={()=>{ if(msg.trim()){ onSend(msg.trim()); setMsg(""); }}} style={{ background:hp, color:"#ffffff", border:"none", padding:"10px 16px", fontWeight:700, fontSize:13, cursor:"pointer" }}>Send</button>
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
        <div style={{ background:"#f0fdf4", border:"1px solid rgba(74,222,128,0.3)", borderRadius:12, overflow:"hidden" }}>
          {isVideo&&idea.uploadedDataUrl&&<video src={idea.uploadedDataUrl} controls style={{ width:"100%", maxHeight:200, display:"block", background:"#000" }}/>}
          {isImage&&idea.uploadedDataUrl&&<img src={idea.uploadedDataUrl} alt="preview" style={{ width:"100%", maxHeight:200, objectFit:"cover", display:"block" }}/>}
          <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:10 }}>
            <div>
              <div style={{ fontSize:13, color:"#0a0a0a", fontWeight:600 }}>🎥 {idea.uploadedFileName}</div>
              <div style={{ fontSize:11, color:"#6b6b6b", marginTop:2 }}>{sizeMB} MB</div>
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
        <div style={{ fontSize:13, color:"#6b6b6b", fontWeight:600 }}>Drop video or image here</div>
        <div style={{ fontSize:11, color:"#b0b0b0", marginTop:3 }}>or tap to browse</div>
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
    <div style={{ background:"#ffffff", border:`2px solid ${isUGC?"#7c3aed60":idea.uploadedFileName?"#86efac":border}`, borderRadius:16, padding:"16px 20px", boxShadow:isUGC?"0 2px 16px rgba(124,58,237,0.08)":"0 2px 10px rgba(255,0,102,0.04)", transition:"all 0.2s" }}>
      {/* UGC banner */}
      {isUGC && (
        <div style={{ background:"linear-gradient(90deg,#7c3aed,#a855f7)", borderRadius:8, padding:"6px 12px", marginBottom:12, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ color:"#ffffff", fontWeight:700, fontSize:12 }}>💜 UGC / Brand Deal</span>
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
            <span style={{ fontSize:12, color:"#b0b0b0" }}>{expanded?"▲":"▼"}</span>
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
        <div style={{ marginTop:14, borderTop:"1px solid var(--border)", paddingTop:14 }}>

          {/* Caption */}
          <div style={{ marginBottom:14 }}>
            <label style={labelSt}>Caption Draft</label>
            <div style={{ fontSize:13, color:"#6b6b6b", lineHeight:1.6, background:"#fdf6f8", padding:"10px 12px", borderRadius:10 }}>{idea.caption}</div>
          </div>

          {/* UGC Brief */}
          {isUGC && (
            <div style={{ marginBottom:14 }}>
              <label style={labelSt}>Brand Brief / Specs</label>
              <div style={{ fontSize:13, color:"#c4b5fd", lineHeight:1.6, background:"#f5f0ff", padding:"10px 12px", borderRadius:10, border:"1px solid #c4b5fd" }}>
                {idea.brief || <span style={{ color:"#7c3aed" }}>No brief added yet</span>}
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
              <div style={{ fontWeight:700, fontSize:13, color:"#b45309", marginBottom:10 }}>⏳ Creator submitted this idea — approve or reject?</div>
              <div style={{ display:"flex", gap:10 }}>
                <Btn onClick={e=>{e.stopPropagation();onStatusChange(idea.id,"idea");}} style={{ flex:1, background:"#16a34a", color:"#ffffff", border:"none" }}>✓ Approve</Btn>
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
        {isCreator && <div style={{ background:"#fefce8", borderRadius:10, padding:"10px 14px", fontSize:13, color:"#b45309" }}>Your idea will be sent to your agency for approval before it goes live on your board.</div>}
        <div>
          <label style={labelSt}>Content Type</label>
          <div style={{ display:"flex", gap:10 }}>
            {["Reel","Post"].map(t=><button key={t} onClick={()=>setForm(f=>({...f,type:t}))} style={{ flex:1, padding:10, borderRadius:10, border:`2px solid ${form.type===t?hp:border}`, background:form.type===t?hpBg:"#ffffff", color:form.type===t?hp:"#999", fontWeight:700, cursor:"pointer", fontSize:14 }}>{t}</button>)}
          </div>
        </div>
        <div><label style={labelSt}>Hook / Video Idea *</label><textarea value={form.hook} onChange={e=>setForm(f=>({...f,hook:e.target.value}))} placeholder='"POV: You just found a $5 dupe that slaps"' rows={3} style={inputSt}/></div>
        <div><label style={labelSt}>Caption Draft</label><textarea value={form.caption} onChange={e=>setForm(f=>({...f,caption:e.target.value}))} placeholder="Caption + hashtags..." rows={3} style={inputSt}/></div>
        <div><label style={labelSt}>Tags (comma-separated)</label><input value={form.tags} onChange={e=>setForm(f=>({...f,tags:e.target.value}))} placeholder="fitness, budget, makeup" style={{ ...inputSt, resize:"none" }}/></div>

        {/* UGC toggle */}
        <div style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", background:"#f5f0ff", borderRadius:10, border:"1px solid #c4b5fd", cursor:"pointer" }} onClick={()=>setForm(f=>({...f,isUGC:!f.isUGC}))}>
          <div style={{ width:40, height:22, borderRadius:11, background:form.isUGC?"#7c3aed":"#e5e7eb", transition:"all 0.2s", position:"relative" }}>
            <div style={{ width:18, height:18, borderRadius:"50%", background:"#ffffff", position:"absolute", top:2, left:form.isUGC?20:2, transition:"all 0.2s" }}/>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:"#c4b5fd" }}>💜 UGC / Brand Deal</div>
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
  <div class="logo">✦ Moli ✦</div>
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
  <div class="footer">Generated by Moli &nbsp;·&nbsp; ${today} &nbsp;·&nbsp; ${invoiceNum}</div>
  </body></html>`;

  const blob = new Blob([html],{type:"text/html"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href=url; a.download=`Moli-Invoice-${client.name.replace(/\s/g,"-")}-${month}.html`;
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

  const update = async (e) => {
    onUpdateClient({ ...client, earnings: e });
    // Save agency cut and name to clients table
    await supabase.from("clients").update({
      agency_cut: e.agencyCut,
      agency_name: e.agencyName,
      platform_notes: client.platform_notes || {},
    }).eq("id", client.id);
  };

  const addEntry = async (entry) => {
    const { data } = await supabase.from("earnings_entries").insert({
      client_id: client.id, platform: entry.platform,
      amount: entry.amount, note: entry.note || "", month: entry.month,
    }).select().single();
    const newEntry = data ? { ...entry, id: data.id } : entry;
    onUpdateClient({ ...client, earnings: { ...earnings, entries: [...(earnings.entries||[]), newEntry] } });
  };

  const removeEntry = async (entryId) => {
    await supabase.from("earnings_entries").delete().eq("id", entryId);
    onUpdateClient({ ...client, earnings: { ...earnings, entries: (earnings.entries||[]).filter(e => e.id !== entryId) } });
  };

  const addDeal = async (deal) => {
    const { data } = await supabase.from("brand_deals").insert({
      client_id: client.id, brand: deal.brand, amount: deal.amount,
      description: deal.description || "", due_date: deal.dueDate || null,
      status: "pending", paid_date: null,
    }).select().single();
    const newDeal = data ? { ...deal, id: data.id } : deal;
    onUpdateClient({ ...client, earnings: { ...earnings, brandDeals: [...(earnings.brandDeals||[]), newDeal] } });
  };

  const markDealPaid = async (dealId) => {
    const month = thisMonth();
    const paidDate = new Date().toISOString().split("T")[0];
    await supabase.from("brand_deals").update({ status: "paid", paid_date: paidDate, month }).eq("id", dealId);
    onUpdateClient({ ...client, earnings: { ...earnings, brandDeals: (earnings.brandDeals||[]).map(d => d.id === dealId ? { ...d, status: "paid", paidDate, month } : d) } });
  };

  const removeDeal = async (dealId) => {
    await supabase.from("brand_deals").delete().eq("id", dealId);
    onUpdateClient({ ...client, earnings: { ...earnings, brandDeals: (earnings.brandDeals||[]).filter(d => d.id !== dealId) } });
  };

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
    <div style={{ background:bg||"rgba(255,0,102,0.12)", borderRadius:12, padding:"14px 16px", border:"1px solid var(--border)", flex:1, minWidth:120 }}>
      <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:color||hp, lineHeight:1 }}>{fmtMoney(value)}</div>
      {sub && <div style={{ fontSize:11, color:"#6b6b6b", marginTop:4 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>

      {/* Creator read-only banner */}
      {!isAgency && (
        <div style={{ background:"#fefce8", border:"1px solid #fde047", borderRadius:12, padding:"12px 16px", marginBottom:20, fontSize:13, color:"#b45309" }}>
          Your earnings are entered by your agency. Review your numbers below and reach out via the notes thread if anything looks off.
        </div>
      )}

      {/* Agency settings bar */}
      {isAgency && (
        <div style={{ background:"#ffffff", borderRadius:14, padding:"14px 18px", border:"1px solid var(--border)", marginBottom:20, display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Agency Name (on invoices)</div>
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
            <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:4 }}>Commission Rate</div>
            {agencyCutEdit ? (
              <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                <input type="number" value={cutVal} onChange={e=>setCutVal(e.target.value)} style={{ ...inputSt, width:60, padding:"5px 10px" }} min={0} max={100}/>
                <span style={{ color:"#6b6b6b" }}>%</span>
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
        <StatCard label="All-Time Gross" value={allTimeTotal} sub="All months" color="#0a0a0a" bg="#ffffff"/>
      </div>

      {/* Affiliate income */}
      <div style={{ background:"#ffffff", borderRadius:14, border:"1px solid var(--border)", padding:"18px 20px", marginBottom:20 }}>
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
                    <div style={{ fontSize:11, color:"#6b6b6b" }}>{ents.length} {ents.length===1?"entry":"entries"}</div>
                  </div>
                </div>
                <div style={{ fontWeight:800, fontSize:16, color:val>0?color:"#b0b0b0" }}>{fmtMoney(val)}</div>
              </div>
            );
          })}
        </div>

        {/* Entry list */}
        {monthEntries.length>0 && (
          <div style={{ marginTop:14, borderTop:"1px solid var(--border)", paddingTop:14 }}>
            <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6, marginBottom:8 }}>Line Items</div>
            <div style={{ display:"grid", gap:6 }}>
              {monthEntries.map(e=>(
                <div key={e.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", fontSize:13, padding:"6px 0", borderBottom:`1px solid #fdf6f8` }}>
                  <div style={{ color:"#6b6b6b" }}>{e.platform}{e.note?` · ${e.note}`:""}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ fontWeight:700, color:"#0a0a0a" }}>{fmtMoney(e.amount)}</span>
                    {isAgency && <button onClick={()=>removeEntry(e.id)} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:13 }}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {monthEntries.length===0 && !isAgency && (
          <div style={{ textAlign:"center", padding:"20px", color:"#b0b0b0", fontSize:13 }}>No affiliate entries added yet for {fmtMonth(month)}</div>
        )}
      </div>

      {/* Brand Deals */}
      <div style={{ background:"#ffffff", borderRadius:14, border:"1px solid var(--border)", padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>Brand Deals</div>
            <div style={{ fontSize:12, color:"#6b6b6b", marginTop:2 }}>{fmtMoney(pendingDeals)} pending · {fmtMoney(paidDeals)} paid all-time</div>
          </div>
          {isAgency && <Btn small variant="purple" onClick={()=>setShowAddDeal(true)}>+ Add Deal</Btn>}
        </div>
        {deals.length===0 && <div style={{ textAlign:"center", padding:"24px", color:"#b0b0b0", fontSize:13 }}>No brand deals tracked yet</div>}
        <div style={{ display:"grid", gap:10 }}>
          {deals.map(deal=>(
            <div key={deal.id} style={{ background:deal.status==="paid"?"#f0fdf4":"#fefce8", borderRadius:12, padding:"14px 16px", border:`1px solid ${deal.status==="paid"?"#86efac":"#fde047"}` }}>
              <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                <div style={{ flex:1 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{deal.brand}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:deal.status==="paid"?"#16a34a":"#b45309", background:deal.status==="paid"?"rgba(74,222,128,0.12)":"#fefce8", borderRadius:20, padding:"1px 8px" }}>{deal.status==="paid"?"✓ Paid":"⏳ Pending"}</span>
                  </div>
                  {deal.description && <div style={{ fontSize:12, color:"#6b6b6b", marginBottom:4 }}>{deal.description}</div>}
                  <div style={{ display:"flex", gap:12, fontSize:11, color:"#6b6b6b" }}>
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
                  <Btn small onClick={()=>{ markDealPaid(deal.id); }}>Mark as Paid</Btn>
                  <button onClick={()=>removeDeal(deal.id)} style={{ background:"none", border:"none", color:"#ddd", cursor:"pointer", fontSize:12 }}>Remove</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Invoice preview note */}
      {isAgency && monthTotal>0 && (
        <div style={{ marginTop:20, background:"linear-gradient(135deg,#fff0f6,#fce8f0)", borderRadius:14, padding:"16px 20px", border:"1px solid var(--border)", display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
          <div>
            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>Ready to invoice for {fmtMonth(month)}?</div>
            <div style={{ fontSize:12, color:"#6b6b6b", marginTop:2 }}>{client.name} owes <strong style={{ color:hp }}>{fmtMoney(agencyEarns)}</strong> ({earnings.agencyCut}% of {fmtMoney(monthTotal)})</div>
          </div>
          <Btn onClick={()=>generateInvoice({ client, month, entries:earnings.entries||[], deals:earnings.brandDeals||[], agencyCut:earnings.agencyCut, agencyName:earnings.agencyName })}>
            🧾 Download Invoice
          </Btn>
        </div>
      )}

      {showAddEntry && (
        <Modal onClose={()=>setShowAddEntry(false)} title="Add Affiliate Entry">
          <AddEntryForm month={month} onAdd={(entry)=>{ addEntry(entry); setShowAddEntry(false); }} onClose={()=>setShowAddEntry(false)}/>
        </Modal>
      )}
      {showAddDeal && (
        <Modal onClose={()=>setShowAddDeal(false)} title="Add Brand Deal">
          <AddDealForm onAdd={(deal)=>{ addDeal(deal); setShowAddDeal(false); }} onClose={()=>setShowAddDeal(false)}/>
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
            <button key={p} onClick={()=>setForm(f=>({...f,platform:p}))} style={{ flex:1, padding:"9px", borderRadius:10, border:`2px solid ${form.platform===p?hp:border}`, background:form.platform===p?hpBg:"#ffffff", color:form.platform===p?hp:"#999", fontWeight:700, cursor:"pointer", fontSize:13 }}>{p}</button>
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

// ─────────────────────────────────────────────
// PROFILE TAB
// ─────────────────────────────────────────────

const BRAND_PREFERENCES = [
  { key:"alcohol",     label:"Alcohol",              emoji:"🍺" },
  { key:"tobacco",     label:"Tobacco / Vaping",     emoji:"🚬" },
  { key:"gambling",    label:"Gambling",              emoji:"🎰" },
  { key:"lingerie",    label:"Lingerie / Intimates",  emoji:"👙" },
  { key:"sexual",      label:"Sexual Content",        emoji:"🔞" },
  { key:"political",   label:"Political Content",     emoji:"🗳️" },
  { key:"mlm",         label:"MLM / Network Marketing", emoji:"🔺" },
  { key:"weightloss",  label:"Weight Loss Products",  emoji:"⚖️" },
  { key:"religious",   label:"Religious Content",     emoji:"✝️" },
  { key:"fastfood",    label:"Fast Food",             emoji:"🍔" },
  { key:"firearms",    label:"Firearms / Weapons",    emoji:"🔫" },
  { key:"cbd",         label:"CBD / Cannabis",        emoji:"🌱" },
  { key:"adultgaming", label:"Adult Gaming",          emoji:"🎮" },
  { key:"financial",   label:"Financial / Crypto",    emoji:"💰" },
];

const SOCIAL_HANDLES = [
  { key:"instagram", label:"Instagram",   emoji:"📸" },
  { key:"tiktok",    label:"TikTok",      emoji:"🎵" },
  { key:"youtube",   label:"YouTube",     emoji:"▶️" },
  { key:"facebook",  label:"Facebook",    emoji:"👥" },
  { key:"pinterest", label:"Pinterest",   emoji:"📌" },
  { key:"twitter",   label:"X / Twitter", emoji:"🐦" },
  { key:"linkedin",  label:"LinkedIn",    emoji:"💼" },
];

function ProfileTab({ client, role, onUpdateClient }) {
  const profile = client.profile || {};
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const update = async (field, value) => {
    const newProfile = { ...profile, [field]: value };
    onUpdateClient({ ...client, profile: newProfile });
    setSaving(true);
    await supabase.from("clients").update({ profile_data: newProfile }).eq("id", client.id);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const updateNested = async (section, field, value) => {
    const newProfile = { ...profile, [section]: { ...(profile[section]||{}), [field]: value } };
    onUpdateClient({ ...client, profile: newProfile });
    setSaving(true);
    const { error } = await supabase.from("clients").update({ profile_data: newProfile }).eq("id", client.id);
    if (error) console.error("Profile save error:", error.message);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  const Section = ({ title, emoji, children }) => (
    <div style={{ background:"#ffffff", borderRadius:16, border:"1px solid var(--border)", padding:"20px 24px", marginBottom:16 }}>
      <div style={{ fontFamily:"Georgia,serif", fontSize:17, color:"#0a0a0a", marginBottom:16, display:"flex", alignItems:"center", gap:8 }}><span>{emoji}</span> {title}</div>
      {children}
    </div>
  );

  const Field = ({ label, field, placeholder, type="text", section }) => (
    <div style={{ marginBottom:12 }}>
      <label style={labelSt}>{label}</label>
      <input type={type} defaultValue={section ? (profile[section]||{})[field]||"" : profile[field]||""} onBlur={e => section ? updateNested(section, field, e.target.value) : update(field, e.target.value)} placeholder={placeholder} style={{ ...inputSt, resize:"none" }}/>
    </div>
  );

  const TextArea = ({ label, field, placeholder, section }) => (
    <div style={{ marginBottom:12 }}>
      <label style={labelSt}>{label}</label>
      <textarea defaultValue={section ? (profile[section]||{})[field]||"" : profile[field]||""} onBlur={e => section ? updateNested(section, field, e.target.value) : update(field, e.target.value)} placeholder={placeholder} rows={3} style={inputSt}/>
    </div>
  );

  const Grid = ({ children }) => (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0 20px" }}>{children}</div>
  );

  return (
    <div style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12, height:20 }}>
        {saving && <span style={{ fontSize:12, color:"#b45309" }}>⟳ Saving...</span>}
        {saved && <span style={{ fontSize:12, color:"#16a34a" }}>✓ Saved</span>}
      </div>

      <Section title="Media Kit & Links" emoji="🔗">
        <Grid>
          <Field label="Personal Website" field="website" placeholder="https://jessicam.com" section="links"/>
          <Field label="Media Kit URL" field="mediakit" placeholder="https://drive.google.com/..." section="links"/>
          <Field label="Press Page" field="press" placeholder="https://..." section="links"/>
          <Field label="Linktree / Link in Bio" field="linktree" placeholder="https://linktr.ee/..." section="links"/>
        </Grid>
        <TextArea label="Media Kit Notes" field="mediakitNotes" placeholder="Engagement rate, audience demographics, past brand partners..." section="links"/>
      </Section>

      <Section title="Rate Card" emoji="💵">
        <Grid>
          <Field label="Instagram Reel" field="reel" placeholder="$500" section="rates"/>
          <Field label="Instagram Post" field="post" placeholder="$300" section="rates"/>
          <Field label="Instagram Story (per slide)" field="story" placeholder="$100" section="rates"/>
          <Field label="TikTok Video" field="tiktok" placeholder="$400" section="rates"/>
          <Field label="YouTube Integration" field="youtube" placeholder="$1,500" section="rates"/>
          <Field label="UGC Only (no post)" field="ugc" placeholder="$200" section="rates"/>
          <Field label="Bundle Rate" field="bundle" placeholder="$800 for Reel + 3 Stories" section="rates"/>
          <Field label="Exclusivity Fee" field="exclusivity" placeholder="+$200/month" section="rates"/>
        </Grid>
        <TextArea label="Rate Notes" field="rateNotes" placeholder="Willing to negotiate for long-term partnerships, gifting combos, etc." section="rates"/>
      </Section>

      <Section title="Personal Details" emoji="🎂">
        <Grid>
          <Field label="Birthday" field="birthday" type="date" section="personal"/>
          <Field label="Anniversary" field="anniversary" type="date" section="personal"/>
          <Field label="Location / City" field="location" placeholder="San Antonio, TX" section="personal"/>
          <Field label="Hometown" field="hometown" placeholder="Houston, TX" section="personal"/>
          <Field label="Ethnicity / Background" field="ethnicity" placeholder="Hispanic" section="personal"/>
          <Field label="Languages Spoken" field="languages" placeholder="English, Spanish" section="personal"/>
        </Grid>
        <div style={{ marginBottom:12 }}>
          <label style={labelSt}>Kids (names & birthdays)</label>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
              <input defaultValue={(profile.kids||[])[i]?.name||""} onBlur={e => { const kids=[...((profile.kids||[null,null,null,null]).map(k=>k||{}))]; kids[i]={...kids[i],name:e.target.value}; update("kids",kids); }} placeholder={`Child ${i+1} name`} style={{ ...inputSt, flex:2, resize:"none" }}/>
              <input type="date" defaultValue={(profile.kids||[])[i]?.bday||""} onBlur={e => { const kids=[...((profile.kids||[null,null,null,null]).map(k=>k||{}))]; kids[i]={...kids[i],bday:e.target.value}; update("kids",kids); }} style={{ ...inputSt, flex:1, resize:"none" }}/>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:12 }}>
          <label style={labelSt}>Pets (name & type)</label>
          {[0,1,2].map(i => (
            <div key={i} style={{ display:"flex", gap:10, marginBottom:8 }}>
              <input defaultValue={(profile.pets||[])[i]?.name||""} onBlur={e => { const pets=[...((profile.pets||[null,null,null]).map(p=>p||{}))]; pets[i]={...pets[i],name:e.target.value}; update("pets",pets); }} placeholder="Pet name" style={{ ...inputSt, flex:1, resize:"none" }}/>
              <input defaultValue={(profile.pets||[])[i]?.type||""} onBlur={e => { const pets=[...((profile.pets||[null,null,null]).map(p=>p||{}))]; pets[i]={...pets[i],type:e.target.value}; update("pets",pets); }} placeholder="e.g. Golden Retriever" style={{ ...inputSt, flex:2, resize:"none" }}/>
            </div>
          ))}
        </div>
        <TextArea label="Other Personal Notes" field="personalNotes" placeholder="Partner name, family dynamics, lifestyle notes useful for pitches..." section="personal"/>
      </Section>

      <Section title="Social Accounts & Following" emoji="📱">
        <div style={{ display:"grid", gap:10 }}>
          {SOCIAL_HANDLES.map(s => (
            <div key={s.key} style={{ display:"flex", alignItems:"center", gap:12 }}>
              <span style={{ fontSize:20, width:28, textAlign:"center" }}>{s.emoji}</span>
              <div style={{ flex:1 }}><input defaultValue={(profile.socials||{})[s.key]?.handle||""} onBlur={e => updateNested("socials", s.key, { ...(profile.socials||{})[s.key], handle:e.target.value })} placeholder={`@${s.label.toLowerCase().replace(" ","")}`} style={{ ...inputSt, resize:"none" }}/></div>
              <div style={{ width:130 }}><input defaultValue={(profile.socials||{})[s.key]?.followers||""} onBlur={e => updateNested("socials", s.key, { ...(profile.socials||{})[s.key], followers:e.target.value })} placeholder="Followers" style={{ ...inputSt, resize:"none" }}/></div>
              <div style={{ width:120 }}><input defaultValue={(profile.socials||{})[s.key]?.engagement||""} onBlur={e => updateNested("socials", s.key, { ...(profile.socials||{})[s.key], engagement:e.target.value })} placeholder="Eng. rate %" style={{ ...inputSt, resize:"none" }}/></div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Content Style & Strengths" emoji="🎨">
        <Grid>
          <Field label="Content Aesthetic" field="aesthetic" placeholder="Bright, minimal, earthy..." section="content"/>
          <Field label="Editing Style" field="editing" placeholder="Fast cuts, voiceover, GRWM..." section="content"/>
          <Field label="Best Performing Content" field="bestContent" placeholder="Budget hauls, tutorials..." section="content"/>
          <Field label="Posting Frequency" field="frequency" placeholder="3x/week reels, daily stories..." section="content"/>
        </Grid>
        <TextArea label="Creator Bio (for pitches)" field="bio" placeholder="Short bio to copy-paste into brand pitches..." section="content"/>
        <TextArea label="Unique Value Proposition" field="uvp" placeholder="What makes this creator stand out?" section="content"/>
      </Section>

      <Section title="Brand Comfort Level" emoji="✅">
        <div style={{ fontSize:13, color:"#6b6b6b", marginBottom:14 }}>Toggle what this creator is comfortable promoting. Red = avoid.</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
          {BRAND_PREFERENCES.map(pref => {
            const val = (profile.brandPrefs||{})[pref.key];
            return (
              <div key={pref.key} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:val===false?"#fef2f2":val===true?"#f0fdf4":"#fdf6f8", borderRadius:10, border:`1px solid ${val===false?"#fca5a5":val===true?"#86efac":border}` }}>
                <span style={{ fontSize:13, fontWeight:600, color:"#0a0a0a" }}>{pref.emoji} {pref.label}</span>
                <div style={{ display:"flex", gap:6 }}>
                  <button onClick={()=>updateNested("brandPrefs", pref.key, true)} style={{ padding:"4px 12px", borderRadius:8, border:`1.5px solid ${val===true?"#16a34a":border}`, background:val===true?"#f0fdf4":"#ffffff", color:val===true?"#16a34a":"#999", fontWeight:700, fontSize:12, cursor:"pointer" }}>Yes</button>
                  <button onClick={()=>updateNested("brandPrefs", pref.key, false)} style={{ padding:"4px 12px", borderRadius:8, border:`1.5px solid ${val===false?"#dc2626":border}`, background:val===false?"#fef2f2":"#ffffff", color:val===false?"#dc2626":"#999", fontWeight:700, fontSize:12, cursor:"pointer" }}>No</button>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop:14 }}>
          <TextArea label="Additional Brand Notes" field="brandNotes" placeholder="Specific brands to avoid, dream partnerships, past negative experiences..." section="brandPrefs"/>
        </div>
      </Section>
    </div>
  );
}


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
      <div style={{ background:"linear-gradient(135deg,#fff0f6,#fce8f0)", border:"1px solid var(--border)", borderRadius:14, padding:"16px 20px", marginBottom:24, display:"flex", alignItems:"center", justifyContent:"space-between", gap:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a" }}>Social Media Analytics</div>
          <div style={{ fontSize:12, color:"#6b6b6b", marginTop:3 }}>
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
            <div key={platform.id} style={{ background:"#ffffff", borderRadius:16, border:`1.5px solid ${hasData?platform.color+"40":border}`, overflow:"hidden" }}>
              {/* Platform header */}
              <div style={{ padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12 }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ width:42, height:42, borderRadius:12, background:platform.color+"15", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>
                    {platform.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight:800, fontSize:15, color:"#0a0a0a" }}>{platform.name}</div>
                    <div style={{ fontSize:11, color:"#6b6b6b" }}>{fmtMonth(selectedMonth)} metrics</div>
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
                      <div key={metric} style={{ background:hasData?"#fdf6f8":"#fafafa", borderRadius:10, padding:"12px 14px", border:"1px solid var(--border)" }}>
                        <div style={{ fontSize:10, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>{metric}</div>
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
      <div style={{ marginTop:24, background:"#fff0f6", borderRadius:14, padding:"16px 20px", textAlign:"center" }}>
        <div style={{ fontWeight:700, fontSize:14, color:"#6b6b6b", marginBottom:4 }}>Auto-sync coming soon</div>
        <div style={{ fontSize:12, color:"#b0b0b0" }}>
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
  { id:"cohley",     name:"Cohley",       url:"https://cohley.com",           color:"#ff6b35", desc:"UGC content platform — apply to product campaigns" },
  { id:"fohr",       name:"Fohr",         url:"https://www.fohr.co",              color:"#6c63ff", desc:"Influencer marketplace — brand partnerships & gifting" },
  { id:"later",      name:"Later",        url:"https://later.com",            color:"#ffd166", desc:"Social scheduling + brand collab opportunities" },
  { id:"insense",    name:"Insense",      url:"https://insense.pro/login",              color:"#07b274", desc:"UGC & influencer briefs — fast-moving campaigns" },
  { id:"upfluence",  name:"Upfluence",    url:"https://www.upfluence.com",        color:"#3b82f6", desc:"Enterprise brand partnerships & affiliate deals" },
  { id:"impact",     name:"Impact",       url:"https://impact.com",           color:"#f43f5e", desc:"Affiliate & partnership network — commission tracking" },
  { id:"aspire",     name:"Aspire",       url:"https://www.aspire.io",         color:"#8b5cf6", desc:"Brand collaboration marketplace & gifting campaigns" },
  { id:"thelobby",   name:"The Lobby",    url:"https://www.thelobby.io",              color:"#0ea5e9", desc:"Creator community with exclusive brand deals" },
  { id:"mavely",     name:"Mavely",       url:"https://joinmavely.com",       color:"#ec4899", desc:"Affiliate links + shoppable content monetization" },
  { id:"ahacreator", name:"AHA Creator",  url:"https://www.ahacreator.com",           color:"#f97316", desc:"UGC briefs and paid creator campaigns" },
];

const APP_STATUS = {
  none:      { label:"Not Applied",  color:"#b0b0b0",     bg:"#ffffff" },
  applied:   { label:"Applied",      color:"#b45309",  bg:"#fefce8" },
  pending:   { label:"Awaiting Response", color:"#7c3aed", bg:"rgba(124,58,237,0.15)" },
  accepted:  { label:"Accepted!",    color:"#16a34a",  bg:"#f0fdf4" },
  declined:  { label:"Declined",     color:"#dc2626",  bg:"#fef2f2" },
  completed: { label:"Completed",    color:"#ff0066",  bg:"#fff0f6" },
};

function AddCustomPlatformForm({ onAdd, onClose }) {
  const [form, setForm] = useState({ name:"", url:"", desc:"", color:"#ff0066" });
  const colors = ["#ff0066","#7c3aed","#0ea5e9","#16a34a","#ea580c","#b45309","#ec4899","#f97316"];

  const handleSubmit = () => {
    if (!form.name.trim() || !form.url.trim()) return;
    const url = form.url.startsWith("http") ? form.url : "https://" + form.url;
    onAdd({
      id: "custom-" + Date.now(),
      name: form.name,
      url,
      desc: form.desc || "Custom platform",
      color: form.color,
    });
  };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
      <div><label style={labelSt}>Platform Name *</label><input value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))} placeholder="e.g. Creator.co" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>URL / Link *</label><input value={form.url} onChange={e=>setForm(f=>({...f,url:e.target.value}))} placeholder="https://creator.co" style={{ ...inputSt, resize:"none" }}/></div>
      <div><label style={labelSt}>Description</label><input value={form.desc} onChange={e=>setForm(f=>({...f,desc:e.target.value}))} placeholder="What is this platform for?" style={{ ...inputSt, resize:"none" }}/></div>
      <div>
        <label style={labelSt}>Color</label>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {["#ff0066","#7c3aed","#0ea5e9","#16a34a","#ea580c","#b45309","#ec4899","#f97316"].map(c=>(
            <button key={c} onClick={()=>setForm(f=>({...f,color:c}))} style={{ width:32, height:32, borderRadius:"50%", background:c, border:form.color===c?"3px solid #0a0a0a":"3px solid transparent", cursor:"pointer" }}/>
          ))}
        </div>
      </div>
      <div style={{ display:"flex", gap:10, marginTop:4 }}>
        <Btn variant="ghost" onClick={onClose} style={{ flex:1 }}>Cancel</Btn>
        <Btn onClick={handleSubmit} style={{ flex:2 }}>+ Add Platform</Btn>
      </div>
    </div>
  );
}


function BrandPlatformsTab({ client, role, onUpdateClient }) {
  const isAgency = role==="agency";
  const platforms = client.platforms || {};
  const [expandedPlatform, setExpandedPlatform] = useState(null);
  const [showAddApp, setShowAddApp] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showAddPlatform, setShowAddPlatform] = useState(false);
  const [customPlatforms, setCustomPlatforms] = useState(client.custom_platforms || []);
  const allPlatforms = [...PLATFORMS, ...customPlatforms];

  const updatePlatforms = async (p) => {
    onUpdateClient({ ...client, platforms: p });
    // Save platform notes to clients table
    const notes = {};
    Object.entries(p).forEach(([pid, pd]) => { if (pd.notes) notes[pid] = pd.notes; });
    await supabase.from("clients").update({ platform_notes: notes }).eq("id", client.id);
  };

  const addPlatformApp = async (platformId, app) => {
    const { data } = await supabase.from("platform_applications").insert({
      client_id: client.id, platform_id: platformId,
      brand: app.brand, amount: app.amount || null,
      description: app.description || "", brief: app.brief || "",
      deadline: app.deadline || null, applied_date: app.appliedDate || null,
      status: app.status,
    }).select().single();
    const newApp = data ? { ...app, id: data.id } : app;
    const pd = platforms[platformId] || { applications: [], notes: "" };
    onUpdateClient({ ...client, platforms: { ...platforms, [platformId]: { ...pd, applications: [...pd.applications, newApp] } } });
  };

  const updateAppStatus = async (platformId, appId, status) => {
    await supabase.from("platform_applications").update({ status }).eq("id", appId);
    const pd = platforms[platformId] || { applications: [], notes: "" };
    const updated = { ...pd, applications: pd.applications.map(a => a.id === appId ? { ...a, status } : a) };
    onUpdateClient({ ...client, platforms: { ...platforms, [platformId]: updated } });
  };

  const removePlatformApp = async (platformId, appId) => {
    await supabase.from("platform_applications").delete().eq("id", appId);
    const pd = platforms[platformId] || { applications: [], notes: "" };
    const updated = { ...pd, applications: pd.applications.filter(a => a.id !== appId) };
    onUpdateClient({ ...client, platforms: { ...platforms, [platformId]: updated } });
  };

  const saveCustomPlatform = async (platform) => {
    const updated = [...customPlatforms, platform];
    setCustomPlatforms(updated);
    onUpdateClient({ ...client, custom_platforms: updated });
    await supabase.from("clients").update({ platform_notes: { ...(client.platform_notes||{}), [`_custom_${platform.id}`]: JSON.stringify(platform) } }).eq("id", client.id);
  };

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
          { label:"Platforms", value:PLATFORMS.length, emoji:"🔗", color:"#0a0a0a", bg:"#ffffff" },
          { label:"Active Applications", value:activeApps.length, emoji:"📋", color:"#7c3aed", bg:"rgba(124,58,237,0.15)" },
          { label:"Awaiting Response", value:pendingApps.length, emoji:"⏳", color:"#b45309", bg:"rgba(250,204,21,0.1)" },
          { label:"Accepted Deals", value:acceptedApps.length, emoji:"✓", color:"#16a34a", bg:"#f0fdf4" },
        ].map(s=>(
          <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:"14px 16px", border:"1px solid var(--border)", flex:1, minWidth:120, textAlign:"center" }}>
            <div style={{ fontSize:20, marginBottom:4 }}>{s.emoji}</div>
            <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
            <div style={{ fontSize:11, color:"#6b6b6b", marginTop:2 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Active applications pipeline */}
      {activeApps.length > 0 && (
        <div style={{ background:"#ffffff", borderRadius:14, border:"1px solid var(--border)", padding:"18px 20px", marginBottom:20 }}>
          <div style={{ fontWeight:700, fontSize:15, color:"#0a0a0a", marginBottom:14 }}>Active Applications Pipeline</div>
          <div style={{ display:"grid", gap:8 }}>
            {activeApps.map(app => (
              <div key={app.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 14px", background:APP_STATUS[app.status]?.bg||"#ffffff", borderRadius:10, border:`1px solid ${APP_STATUS[app.status]?.color}30` }}>
                <div style={{ width:10, height:10, borderRadius:"50%", background:app.platformColor, flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:700, fontSize:13, color:"#0a0a0a" }}>{app.brand} <span style={{ color:"#6b6b6b", fontWeight:400 }}>via {app.platformName}</span></div>
                  {app.amount && <div style={{ fontSize:12, color:"#16a34a", fontWeight:600 }}>{fmtMoney(app.amount)}</div>}
                  {app.deadline && <div style={{ fontSize:11, color:"#6b6b6b" }}>Due {new Date(app.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>}
                </div>
                <span style={{ fontSize:11, fontWeight:700, color:APP_STATUS[app.status]?.color, background:"#ffffff", borderRadius:20, padding:"3px 10px", border:`1px solid ${APP_STATUS[app.status]?.color}40` }}>
                  {APP_STATUS[app.status]?.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Platform list */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:18, color:"#0a0a0a" }}>All Platforms</div>
        <Btn small variant="outline" onClick={()=>setShowAddPlatform(true)}>+ Add Platform</Btn>
      </div>
      <div style={{ display:"grid", gap:12 }}>
        {allPlatforms.map(platform => {
          const pd = platforms[platform.id] || { applications:[], notes:"" };
          const apps = pd.applications || [];
          const isExpanded = expandedPlatform === platform.id;
          const hasActive = apps.some(a=>a.status!=="completed");
          const accepted = apps.filter(a=>a.status==="accepted").length;
          const pending = apps.filter(a=>a.status==="applied"||a.status==="pending").length;

          return (
            <div key={platform.id} style={{ background:"#ffffff", borderRadius:16, border:`1.5px solid ${hasActive?platform.color+"40":border}`, boxShadow:hasActive?`0 2px 12px ${platform.color}15`:"none", overflow:"hidden" }}>
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
                  <div style={{ fontSize:12, color:"#6b6b6b" }}>{platform.desc}</div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <a href={platform.url} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{ background:platform.color, color:"#ffffff", borderRadius:8, padding:"6px 14px", fontSize:12, fontWeight:700, textDecoration:"none", whiteSpace:"nowrap" }}>
                    Open Platform
                  </a>
                  <span style={{ color:"#b0b0b0", fontSize:14 }}>{isExpanded?"▲":"▼"}</span>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div style={{ borderTop:"1px solid var(--border)", padding:"16px 20px" }}>

                  {/* Applications list */}
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#6b6b6b", textTransform:"uppercase", letterSpacing:0.6 }}>Applications ({apps.length})</div>
                    <Btn small onClick={()=>setShowAddApp(platform.id)}>+ Track Application</Btn>
                  </div>

                  {apps.length===0 && (
                    <div style={{ textAlign:"center", padding:"20px", color:"#b0b0b0", fontSize:13, background:"#fdf6f8", borderRadius:10 }}>
                      No applications tracked yet — hit a brief on {platform.name} and track it here
                    </div>
                  )}

                  <div style={{ display:"grid", gap:8, marginBottom:apps.length>0?14:0 }}>
                    {apps.map(app=>(
                      <div key={app.id} style={{ background:APP_STATUS[app.status]?.bg||"#ffffff", borderRadius:10, padding:"12px 14px", border:`1px solid ${APP_STATUS[app.status]?.color}30` }}>
                        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:10 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a", marginBottom:3 }}>{app.brand}</div>
                            {app.description && <div style={{ fontSize:12, color:"#6b6b6b", marginBottom:4 }}>{app.description}</div>}
                            {app.brief && <div style={{ fontSize:12, color:"#c4b5fd", background:"#f5f0ff", padding:"6px 10px", borderRadius:8, marginBottom:6, border:"1px solid #c4b5fd" }}>Brief: {app.brief}</div>}
                            <div style={{ display:"flex", gap:10, flexWrap:"wrap", fontSize:11, color:"#6b6b6b" }}>
                              {app.amount && <span style={{ color:"#16a34a", fontWeight:700 }}>{fmtMoney(app.amount)}</span>}
                              {app.deadline && <span>Deadline: {new Date(app.deadline).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                              {app.appliedDate && <span>Applied: {new Date(app.appliedDate).toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>}
                            </div>
                          </div>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6, flexShrink:0 }}>
                            <span style={{ fontSize:11, fontWeight:700, color:APP_STATUS[app.status]?.color, background:"#ffffff", borderRadius:20, padding:"3px 10px", border:`1px solid ${APP_STATUS[app.status]?.color}40` }}>{APP_STATUS[app.status]?.label}</span>
                            {isAgency && (
                              <select value={app.status} onChange={e=>{
                                updateAppStatus(platform.id, app.id, e.target.value);
                              }} style={{ fontSize:11, border:"1px solid var(--border)", borderRadius:6, padding:"2px 6px", color:"#6b6b6b", background:"#ffffff" }}>
                                {Object.entries(APP_STATUS).filter(([k])=>k!=="none").map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                              </select>
                            )}
                            {isAgency && <button onClick={()=>{
                              removePlatformApp(platform.id, app.id);
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
                      value={pd.notes||""}
                      onChange={e=>{
                        const updated={...pd,notes:e.target.value};
                        onUpdateClient({ ...client, platforms: { ...platforms, [platform.id]: updated } });
                      }}
                      onBlur={async e=>{
                        const noteVal = e.target.value;
                        const allPlatforms = { ...platforms, [platform.id]: { ...pd, notes: noteVal } };
                        const notes = {};
                        Object.entries(allPlatforms).forEach(([pid, p]) => { if (p.notes) notes[pid] = p.notes; });
                        const { error } = await supabase.from("clients").update({ platform_notes: notes }).eq("id", client.id);
                        if (error) console.error("platform notes save error:", error.message, "client.id:", client.id);
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

      {/* Add Platform Modal */}
      {showAddPlatform && (
        <Modal onClose={()=>setShowAddPlatform(false)} title="Add Custom Platform">
          <AddCustomPlatformForm
            onAdd={(p)=>{ saveCustomPlatform(p); setShowAddPlatform(false); }}
            onClose={()=>setShowAddPlatform(false)}
          />
        </Modal>
      )}

      {/* Add Application Modal */}
      {showAddApp && (
        <Modal onClose={()=>setShowAddApp(null)} title={`Track Application — ${PLATFORMS.find(p=>p.id===showAddApp)?.name}`} wide>
          <AddApplicationForm
            onAdd={(app)=>{
              addPlatformApp(showAddApp, app);
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
            <button key={k} onClick={()=>setForm(f=>({...f,status:k}))} style={{ padding:"7px 14px", borderRadius:10, border:`2px solid ${form.status===k?v.color:border}`, background:form.status===k?v.bg:"#ffffff", color:form.status===k?v.color:"#6b6b6b", fontWeight:700, cursor:"pointer", fontSize:12 }}>{v.label}</button>
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
// PITCH LEADS TAB
// ─────────────────────────────────────────────

const ALL_NICHES = ["beauty","makeup","skincare","fashion","lifestyle","haircare","home","fitness","wellness","travel","food","cooking","parenting","tech","gaming","finance","interior design","pets","books","photography","comedy","music","sports","clean living"];
const HEAT_COLORS = {
  hot:  { bg:"#fff0f0", color:"#dc2626", border:"#fca5a5", label:"🔥 Hot" },
  warm: { bg:"#fff7ed", color:"#ea580c", border:"#fdba74", label:"🌤 Warm" },
  cold: { bg:"#eff6ff", color:"#2563eb", border:"#93c5fd", label:"❄️ Cold" },
};

function PitchLeadsTab({ client, role, onUpdateClient }) {
  const isAgency = role === "agency";
  const [brands, setBrands] = useState([]);
  const [pitchLeads, setPitchLeads] = useState([]); // { brand_id, heat, status }
  const [activeNiches, setActiveNiches] = useState(client.pitch_niches || client.niche?.toLowerCase().split(/[,\s]+/).filter(n=>ALL_NICHES.includes(n)) || []);
  const [heatFilter, setHeatFilter] = useState("all");
  const [sponsorFilter, setSponsorFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitForm, setSubmitForm] = useState({ brand_name:"", website:"", notes:"" });
  const [submitting, setSubmitting] = useState(false);
  const [pendingSubmissions, setPendingSubmissions] = useState([]);

  // Load brands from Supabase
  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: brandData } = await supabase.from("brands").select("*");
      setBrands(brandData || []);

      // Load this creator's pitch leads (heat tags)
      const { data: leadsData } = await supabase
        .from("pitch_leads")
        .select("*")
        .eq("client_id", client.id);
      setPitchLeads(leadsData || []);

      // Load pending brand submissions for this creator
      const { data: subData } = await supabase
        .from("brand_submissions")
        .select("*")
        .eq("client_id", client.id);
      setPendingSubmissions(subData || []);

      setLoading(false);
    }
    load();
  }, [client.id]);

  // Save niche toggles to creator's Supabase record
  const toggleNiche = async (niche) => {
    const updated = activeNiches.includes(niche)
      ? activeNiches.filter(n => n !== niche)
      : [...activeNiches, niche];
    setActiveNiches(updated);
    await supabase.from("clients").update({ pitch_niches: updated }).eq("id", client.id);
    onUpdateClient({ ...client, pitch_niches: updated });
  };

  // Set heat tag on a brand
  const setHeat = async (brandId, heat) => {
    const existing = pitchLeads.find(l => l.brand_id === brandId);
    if (existing) {
      const newHeat = existing.heat === heat ? null : heat;
      if (newHeat === null) {
        await supabase.from("pitch_leads").delete().eq("id", existing.id);
        setPitchLeads(prev => prev.filter(l => l.brand_id !== brandId));
      } else {
        await supabase.from("pitch_leads").update({ heat: newHeat }).eq("id", existing.id);
        setPitchLeads(prev => prev.map(l => l.brand_id === brandId ? { ...l, heat: newHeat } : l));
      }
    } else {
      const { data } = await supabase.from("pitch_leads").insert({
        client_id: client.id, brand_id: brandId, heat
      }).select().single();
      if (data) setPitchLeads(prev => [...prev, data]);
    }
  };

  // Agency: add brand directly to brands table
  const handleAddBrand = async () => {
    if (!submitForm.brand_name.trim()) return;
    setSubmitting(true);
    const { data } = await supabase.from("brands").insert({
      brand_name: submitForm.brand_name,
      website: submitForm.website || null,
      pr_email: submitForm.pr_email || null,
      niches: activeNiches.length > 0 ? activeNiches : [],
      actively_sponsoring: false,
    }).select().single();
    if (data) setBrands(prev => [...prev, data]);
    setSubmitForm({ brand_name:"", website:"", notes:"", pr_email:"" });
    setShowSubmit(false);
    setSubmitting(false);
  };

  // Submit a brand
  const handleSubmitBrand = async () => {
    if (!submitForm.brand_name.trim()) return;
    setSubmitting(true);
    const { data } = await supabase.from("brand_submissions").insert({
      client_id: client.id,
      brand_name: submitForm.brand_name,
      website: submitForm.website,
      notes: submitForm.notes,
      status: "pending",
    }).select().single();
    if (data) setPendingSubmissions(prev => [...prev, data]);
    setSubmitForm({ brand_name:"", website:"", notes:"" });
    setShowSubmit(false);
    setSubmitting(false);
  };

  // Agency: approve/reject submissions
  const handleSubmissionAction = async (subId, action) => {
    await supabase.from("brand_submissions").update({ status: action }).eq("id", subId);
    setPendingSubmissions(prev => prev.map(s => s.id === subId ? { ...s, status: action } : s));
  };

  // Filter brands by active niches
  const matchedBrands = brands.filter(b => {
    const niches = Array.isArray(b.niches) ? b.niches : (typeof b.niches === "string" ? JSON.parse(b.niches) : []);
    return activeNiches.length === 0 || niches.some(n => activeNiches.includes(n));
  });

  const getHeat = (brandId) => pitchLeads.find(l => l.brand_id === brandId)?.heat || null;

  const filtered = matchedBrands.filter(b => {
    const heat = getHeat(b.id);
    if (heatFilter !== "all" && heat !== heatFilter) return false;
    if (sponsorFilter === "yes" && !b.actively_sponsoring) return false;
    if (sponsorFilter === "no" && b.actively_sponsoring) return false;
    return true;
  });

  const inputStLight = { ...inputSt, border:"1.5px solid #f8b4ce", background:"#fff0f6" };

  return (
    <div style={{ maxWidth:960, margin:"0 auto", padding:"28px 24px" }}>

      {/* Niche Toggles */}
      <div style={{ background:"#ffffff", borderRadius:16, border:"1px solid var(--border)", padding:"20px 24px", marginBottom:20 }}>
        <div style={{ fontFamily:"Georgia,serif", fontSize:17, color:"#0a0a0a", marginBottom:4 }}>Niche Filters</div>
        <div style={{ fontSize:12, color:"#6b6b6b", marginBottom:14 }}>Toggle niches to show matching brands. Your selections are saved per creator.</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {ALL_NICHES.map(n => (
            <button key={n} onClick={() => toggleNiche(n)} style={{
              padding:"7px 16px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
              background: activeNiches.includes(n) ? hp : "transparent",
              color: activeNiches.includes(n) ? "#ffffff" : "#999",
              border: `1.5px solid ${activeNiches.includes(n) ? hp : "#f0d0dc"}`,
            }}>
              {n.charAt(0).toUpperCase() + n.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Filters row */}
      <div style={{ display:"flex", gap:10, marginBottom:18, flexWrap:"wrap", alignItems:"center" }}>
        <div style={{ fontSize:13, color:"#6b6b6b", fontWeight:600 }}>Filter:</div>
        {["all","hot","warm","cold"].map(h => (
          <button key={h} onClick={()=>setHeatFilter(h)} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
            background: heatFilter===h ? (h==="all"?"#0a0a0a":HEAT_COLORS[h].bg) : "transparent",
            color: heatFilter===h ? (h==="all"?"#fff":HEAT_COLORS[h].color) : "#999",
            border: `1.5px solid ${heatFilter===h?(h==="all"?"#0a0a0a":HEAT_COLORS[h].border):"#f0d0dc"}`,
          }}>
            {h==="all" ? "All" : HEAT_COLORS[h].label}
          </button>
        ))}
        <div style={{ width:1, background:"#f0d0dc", alignSelf:"stretch", margin:"0 4px" }}/>
        {[["all","All Brands"],["yes","Actively Sponsoring"],["no","Not Confirmed"]].map(([v,l])=>(
          <button key={v} onClick={()=>setSponsorFilter(v)} style={{ padding:"6px 14px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer",
            background: sponsorFilter===v ? hpBg : "transparent",
            color: sponsorFilter===v ? hp : "#999",
            border: `1.5px solid ${sponsorFilter===v?hp:"#f0d0dc"}`,
          }}>{l}</button>
        ))}
        <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
          <span style={{ fontSize:12, color:"#b0b0b0" }}>{filtered.length} brands</span>
          <Btn small onClick={()=>setShowSubmit(true)}>{isAgency ? "+ Add Brand" : "+ Submit a Brand"}</Btn>
        </div>
      </div>

      {/* Brand list */}
      {loading ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#b0b0b0" }}>Loading brands...</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:"60px 20px", color:"#b0b0b0" }}>
          <div style={{ fontSize:36, marginBottom:12 }}>🎯</div>
          <div style={{ fontFamily:"Georgia,serif", fontSize:18, color:"#6b6b6b" }}>No brands match your filters</div>
          <div style={{ fontSize:13, marginTop:6 }}>Try toggling more niches above</div>
        </div>
      ) : (
        <div style={{ display:"grid", gap:10 }}>
          {filtered.map(brand => {
            const heat = getHeat(brand.id);
            const niches = Array.isArray(brand.niches) ? brand.niches : (typeof brand.niches === "string" ? JSON.parse(brand.niches) : []);
            return (
              <div key={brand.id} style={{ background:"#ffffff", borderRadius:14, border:`1.5px solid ${heat?HEAT_COLORS[heat].border:"#f0d0dc"}`, padding:"16px 20px", display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
                <div style={{ flex:1, minWidth:160 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{brand.brand_name}</div>
                  <div style={{ fontSize:12, color:"#b0b0b0", marginTop:2 }}>{brand.website}</div>
                  <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginTop:6 }}>
                    {niches.map(n => <span key={n} style={{ fontSize:10, fontWeight:700, background:"rgba(255,0,102,0.08)", color:hp, borderRadius:20, padding:"2px 8px", textTransform:"uppercase" }}>{n}</span>)}
                    {brand.actively_sponsoring && <span style={{ fontSize:10, fontWeight:700, background:"rgba(22,163,74,0.1)", color:"#16a34a", borderRadius:20, padding:"2px 8px" }}>✓ Sponsoring</span>}
                  </div>
                </div>
                {brand.pr_email && (
                  <div style={{ fontSize:12, color:"#7c3aed", fontFamily:"monospace" }}>{brand.pr_email}</div>
                )}
                {/* Heat tags */}
                <div style={{ display:"flex", gap:6 }}>
                  {["hot","warm","cold"].map(h => (
                    <button key={h} onClick={()=>setHeat(brand.id, h)} style={{
                      padding:"5px 12px", borderRadius:20, fontSize:11, fontWeight:700, cursor:"pointer", transition:"all 0.15s",
                      background: heat===h ? HEAT_COLORS[h].bg : "transparent",
                      color: heat===h ? HEAT_COLORS[h].color : "#ccc",
                      border: `1.5px solid ${heat===h ? HEAT_COLORS[h].border : "#f0d0dc"}`,
                    }}>{HEAT_COLORS[h].label}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending brand submissions */}
      {pendingSubmissions.length > 0 && (
        <div style={{ marginTop:28, background:"#ffffff", borderRadius:16, border:"1px solid #fde047", padding:"20px 24px" }}>
          <div style={{ fontFamily:"Georgia,serif", fontSize:17, color:"#0a0a0a", marginBottom:14 }}>⏳ Brand Submissions</div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {pendingSubmissions.map(s => (
              <div key={s.id} style={{ background:"#fefce8", borderRadius:12, padding:"12px 16px", border:"1px solid #fde047", display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:"#0a0a0a" }}>{s.brand_name}</div>
                  {s.website && <div style={{ fontSize:12, color:"#6b6b6b" }}>{s.website}</div>}
                  {s.notes && <div style={{ fontSize:12, color:"#6b6b6b", marginTop:2 }}>{s.notes}</div>}
                </div>
                <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                  {s.status === "pending" ? (
                    <span style={{ fontSize:11, fontWeight:700, color:"#b45309", background:"#fefce8", border:"1px solid #fde047", borderRadius:20, padding:"3px 10px" }}>⏳ Pending Review</span>
                  ) : s.status === "approved" ? (
                    <span style={{ fontSize:11, fontWeight:700, color:"#16a34a", background:"#f0fdf4", border:"1px solid #86efac", borderRadius:20, padding:"3px 10px" }}>✓ Approved</span>
                  ) : (
                    <span style={{ fontSize:11, fontWeight:700, color:"#dc2626", background:"#fff0f0", border:"1px solid #fca5a5", borderRadius:20, padding:"3px 10px" }}>✕ Not a fit</span>
                  )}
                  {isAgency && s.status === "pending" && (
                    <>
                      <Btn small onClick={()=>handleSubmissionAction(s.id,"approved")}>✓ Approve</Btn>
                      <Btn small variant="danger" onClick={()=>handleSubmissionAction(s.id,"rejected")}>✕ Pass</Btn>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Submit brand modal */}
      {showSubmit && (
        <Modal onClose={()=>setShowSubmit(false)} title={isAgency ? "➕ Add Brand" : "🎯 Submit a Brand"}>
          <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
            <div style={{ fontSize:13, color:"#6b6b6b" }}>{isAgency ? "Add a brand directly to the directory." : "Know a brand you'd love to work with? Submit it and your agency will review it."}</div>
            <div><label style={labelSt}>Brand Name *</label><input value={submitForm.brand_name} onChange={e=>setSubmitForm(f=>({...f,brand_name:e.target.value}))} placeholder="e.g. Glossier" style={inputStLight}/></div>
            <div><label style={labelSt}>Website</label><input value={submitForm.website} onChange={e=>setSubmitForm(f=>({...f,website:e.target.value}))} placeholder="e.g. glossier.com" style={inputStLight}/></div>
            {isAgency && <div><label style={labelSt}>PR Email</label><input value={submitForm.pr_email||""} onChange={e=>setSubmitForm(f=>({...f,pr_email:e.target.value}))} placeholder="e.g. pr@glossier.com" style={inputStLight}/></div>}
            {!isAgency && <div><label style={labelSt}>Why this brand?</label><textarea value={submitForm.notes} onChange={e=>setSubmitForm(f=>({...f,notes:e.target.value}))} placeholder="Tell your agency why this is a good fit..." rows={3} style={inputStLight}/></div>}
            <div style={{ display:"flex", gap:10 }}>
              <Btn variant="ghost" onClick={()=>setShowSubmit(false)} style={{ flex:1 }}>Cancel</Btn>
              <Btn onClick={isAgency ? handleAddBrand : handleSubmitBrand} disabled={submitting||!submitForm.brand_name.trim()} style={{ flex:2 }}>{submitting ? (isAgency?"Adding...":"Submitting...") : (isAgency?"Add Brand":"Submit Brand")}</Btn>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// CLIENT BOARD
// ─────────────────────────────────────────────

function ClientBoard({ client, role, onBack, onUpdateClient, onLogout }) {
  const [tab, setTab] = useState("profile");
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

  const handleStatusChange = async (id, status) => {
    updateIdeas(prev => prev.map(i => i.id === id ? { ...i, status } : i));
    await supabase.from("ideas").update({ status }).eq("id", id);
  };

  const handleDelete = async (id) => {
    updateIdeas(prev => prev.filter(i => i.id !== id));
    await supabase.from("ideas").delete().eq("id", id);
  };

  const handleNoteChange = async (id, notes) => {
    updateIdeas(prev => prev.map(i => i.id === id ? { ...i, notes } : i));
    await supabase.from("ideas").update({ notes }).eq("id", id);
  };

  const handleUpload = useCallback(async (ideaId, fileObj) => {
    if (fileObj) {
      let uploadedUrl = null;
      // Upload file to Supabase Storage
      try {
        const ext = fileObj.name.split(".").pop();
        const path = `${client.id}/${ideaId}-${Date.now()}.${ext}`;
        const base64 = fileObj.dataUrl.split(",")[1];
        const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("uploads")
          .upload(path, bytes, { contentType: fileObj.type, upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabase.storage.from("uploads").getPublicUrl(path);
          uploadedUrl = urlData.publicUrl;
        }
      } catch (e) { console.error("Upload error:", e); }

      updateIdeas(prev => prev.map(i => i.id === ideaId ? {
        ...i,
        uploadedFileName: fileObj.name, uploadedFileSize: fileObj.size,
        uploadedFileType: fileObj.type, uploadedDataUrl: fileObj.dataUrl,
        uploadedUrl, uploadedAt: new Date().toISOString(),
        status: (i.status === "idea" || i.status === "filming") ? "uploaded_raw" : i.status,
      } : i));
      await supabase.from("ideas").update({
        uploaded_file_name: fileObj.name,
        uploaded_at: new Date().toISOString(),
        status: (() => { const idea = client.ideas.find(i => i.id === ideaId); return (idea?.status === "idea" || idea?.status === "filming") ? "uploaded_raw" : idea?.status; })(),
      }).eq("id", ideaId);
    } else {
      updateIdeas(prev => prev.map(i => i.id === ideaId ? {
        ...i, uploadedFileName: null, uploadedFileSize: null,
        uploadedFileType: null, uploadedDataUrl: null, uploadedUrl: null, uploadedAt: null,
      } : i));
      await supabase.from("ideas").update({ uploaded_file_name: null, uploaded_at: null }).eq("id", ideaId);
    }
  }, [client]);

  const handleThreadSend = async (ideaId, text) => {
    const msg = { from: role, text, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
    updateIdeas(prev => prev.map(i => i.id === ideaId ? { ...i, thread: [...(i.thread || []), msg] } : i));
    await supabase.from("messages").insert({ idea_id: ideaId, from_role: role, text });
  };

  const handleAddIdea = async (idea) => {
    // Insert to Supabase first to get real UUID
    const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idea.id);
    if (!isRealUUID) {
      const { data, error } = await supabase.from("ideas").insert({
        client_id: client.id, type: idea.type, hook: idea.hook,
        caption: idea.caption, tags: idea.tags, status: idea.status,
        notes: idea.notes, is_ugc: idea.isUGC, deadline: idea.deadline || null,
        brief: idea.brief || null,
      }).select().single();
      if (!error && data) {
        updateIdeas(prev => [{ ...idea, id: data.id }, ...prev]);
        return;
      }
    }
    updateIdeas(prev => [idea, ...prev]);
  };

  const handleCSVImport = async (rows) => {
    const newIdeas = [];
    for (const r of rows) {
      const { data } = await supabase.from("ideas").insert({
        client_id: client.id, type: r.type || "Reel", hook: r.hook,
        caption: r.caption || "", tags: (r.tags || "").split(",").map(t => t.trim()).filter(Boolean),
        status: "idea", notes: "", is_ugc: r.isUGC === "true",
        deadline: r.deadline || null, brief: r.brief || null,
      }).select().single();
      if (data) newIdeas.push({ id: data.id, type: data.type, hook: data.hook, caption: data.caption || "", tags: data.tags || [], status: data.status, notes: "", thread: [], isUGC: data.is_ugc, deadline: data.deadline, brief: data.brief, uploadedFileName: null, uploadedAt: null });
    }
    updateIdeas(prev => [...newIdeas, ...prev]);
  };

  const tabs = [
    { key:"profile",    label:"Profile",         emoji:"👤" },
    { key:"platforms",  label:"Brand Platforms", emoji:"🔗" },
    { key:"ideas",      label:"Content Board",   emoji:"📋" },
    { key:"analytics",  label:"Analytics",       emoji:"📊" },
    { key:"earnings",   label:"Earnings",        emoji:"💰" },
    { key:"pitchleads", label:"Pitch Leads",     emoji:"🎯" },
  ];

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#fdf6f8" }}>
      {isAgency && <Sidebar activeTab="creators" onNavigate={()=>onBack()} onLogout={onLogout} userInfo={null} clients={[]}/>}
      <div style={{ flex:1, overflow:"auto" }}>
      <Header
        left={isAgency&&<button onClick={onBack} style={{ background:"none", border:"none", color:hp, fontWeight:700, fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:4 }}><i className="ti ti-arrow-left" style={{fontSize:14}}/> All Creators</button>}
        title={`${client.name} · ${client.handle}`}
        right={
          <div style={{ display:"flex", gap:10, alignItems:"center" }}>
            {tab==="ideas" && isAgency && <>
              <Btn variant="ghost" small onClick={()=>setShowCSV(true)}>📥 Bulk Upload</Btn>
              <Btn small onClick={()=>setShowAdd(true)}>+ Add Idea</Btn>
            </>}
            {tab==="ideas" && !isAgency && <Btn variant="outline" small onClick={()=>setShowAdd(true)}>💡 Suggest Idea</Btn>}
            {!isAgency && <Btn variant="ghost" small onClick={onLogout}>Sign out</Btn>}
          </div>
        }
      />

      {/* Big stat bar */}
      <StatBar ideas={ideas} extra={counts.pending>0?[{label:"Pending Approval",value:counts.pending,emoji:"⏳"}]:[]}/>

      {/* Tab nav */}
      <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"0 24px" }}>
        <div style={{ maxWidth:960, margin:"0 auto", display:"flex", gap:0 }}>
          {tabs.map(t=>(
            <button key={t.key} onClick={()=>setTab(t.key)} style={{ padding:"14px 20px", border:"none", borderBottom:`3px solid ${tab===t.key?hp:"transparent"}`, background:"transparent", color:tab===t.key?hp:"#b0b0b0", fontWeight:500, fontSize:13, cursor:"pointer", transition:"all 0.15s" }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Ideas tab */}
      {tab==="ideas" && (
        <>
          <div style={{ background:"#ffffff", borderBottom:"1px solid var(--border)", padding:"12px 24px" }}>
            <div style={{ maxWidth:900, margin:"0 auto" }}>
              <div style={{ display:"flex", gap:7, overflowX:"auto", paddingBottom:8, marginBottom:10 }}>
                {[["all","All",ideas.length],...Object.entries(STATUS_CONFIG).map(([k,v])=>[k,`${v.emoji} ${v.label}`,counts[k]||0])].map(([key,label,count])=>(
                  <button key={key} onClick={()=>setFilter(key)} style={{ background:filter===key?(key==="all"?"#0a0a0a":STATUS_COLORS[key]?.bg):"transparent", border:`1.5px solid ${filter===key?(key==="all"?"#0a0a0a":STATUS_COLORS[key]?.color+"60"):border}`, color:filter===key?(key==="all"?"#ffffff":STATUS_COLORS[key]?.color):"#999", borderRadius:20, padding:"5px 14px", cursor:"pointer", fontSize:12, fontWeight:700, whiteSpace:"nowrap" }}>
                    {label}{count>0?` (${count})`:""}</button>
                ))}
              </div>
              <div style={{ display:"flex", gap:10 }}>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ideas..." style={{ ...inputSt, flex:1, padding:"8px 14px" }}/>
                {["all","Reel","Post"].map(t=>(
                  <button key={t} onClick={()=>setTypeFilter(t)} style={{ padding:"8px 14px", borderRadius:10, border:`1.5px solid ${typeFilter===t?hp:border}`, background:typeFilter===t?hpBg:"#ffffff", color:typeFilter===t?hp:"#999", cursor:"pointer", fontWeight:700, fontSize:13 }}>{t==="all"?"All":t}</button>
                ))}
              </div>
            </div>
          </div>
          <main style={{ maxWidth:900, margin:"0 auto", padding:"24px 20px" }}>
            {filtered.length===0?(
              <div style={{ textAlign:"center", padding:"60px 20px", color:"#b0b0b0" }}>
                <div style={{ fontSize:40, marginBottom:12 }}>💡</div>
                <div style={{ fontFamily:"Georgia,serif", fontSize:20, color:"#6b6b6b" }}>No ideas here</div>
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

      {/* Profile tab */}
      {tab==="profile" && (
        <ProfileTab client={client} role={role} onUpdateClient={onUpdateClient}/>
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

      {/* Pitch Leads tab */}
      {tab==="pitchleads" && (
        <PitchLeadsTab client={client} role={role} onUpdateClient={onUpdateClient}/>
      )}

      {showAdd && <AddIdeaModal onAdd={handleAddIdea} onClose={()=>setShowAdd(false)} isCreator={!isAgency}/>}
      {showCSV && <CSVUploadModal onImport={handleCSVImport} onClose={()=>setShowCSV(false)}/>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ROOT
// ─────────────────────────────────────────────

export default function Moli({ userInfo, onLogout }) {
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
        // Build platforms object from apps + notes
        const platforms = {};
        apps.forEach(a => {
          if (!platforms[a.platformId]) platforms[a.platformId] = { applications: [], notes: "" };
          platforms[a.platformId].applications.push(a);
        });
        // Restore saved notes
        if (c.platform_notes) {
          Object.entries(c.platform_notes).forEach(([pid, notes]) => {
            if (!platforms[pid]) platforms[pid] = { applications: [], notes: "" };
            platforms[pid].notes = notes;
          });
        }
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
    const realId = await saveClient(client);
    if (!realId) return;
    setClients(prev => [...prev, {
      ...client,
      id: realId,
      ideas: [], platforms: {},
      earnings: { agencyCut: 20, agencyName: userInfo.agencyName || "Your Agency", entries: [], brandDeals: [] }
    }]);
  };

  if (!loaded) return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: "#ff0066", marginBottom: 12 }}>✦ Moli ✦</div>
        <div style={{ color: "#b0b0b0", fontSize: 14 }}>Loading your Moli workspace...</div>
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
        userInfo={userInfo}
      />
      {showAddClient && <AddClientModal onAdd={handleAddClient} onClose={() => setShowAddClient(false)} agencyCode={userInfo.agencyCode} />}
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
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: "#ff0066", marginBottom: 12 }}>✦ Moli ✦</div>
        <div style={{ fontSize: 15, color: "#6b6b6b", marginBottom: 20 }}>Your agency hasn't linked your account yet. Reach out to them to get set up!</div>
        <button onClick={handleLogout} style={{ background: "#ff0066", color: "#ffffff", border: "none", borderRadius: 10, padding: "10px 24px", fontWeight: 700, cursor: "pointer" }}>Sign Out</button>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fdf6f8", display: "flex", alignItems: "center", justifyContent: "center", color: "#b0b0b0" }}>
      Loading...
    </div>
  );
}
