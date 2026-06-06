"use client";

import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import FilmIt from "./FilmIt";

// ─────────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────────

const hp = "#ff0066";
const border = "rgba(255,255,255,0.1)";
const hpBg = "rgba(255,0,102,0.12)";

const pageStyle = {
  minHeight: "100vh",
  background: "var(--bg)",
  display: "flex", flexDirection: "column",
  alignItems: "center", justifyContent: "center", padding: 24,
};

const cardStyle = {
  background: "var(--bg-card)", borderRadius: 20, padding: 32,
  width: "100%", maxWidth: 440,
  boxShadow: "0 4px 32px rgba(255,0,102,0.10)",
  border: "1px solid var(--border)",
};

const inputSt = {
  width: "100%", background: "var(--bg-card)",
  border: "1px solid var(--border-md)", borderRadius: 10,
  padding: "10px 14px", color: "var(--text)",
  fontSize: 14, outline: "none",
  boxSizing: "border-box", fontFamily: "inherit",
};

const labelSt = {
  fontSize: 11, fontWeight: 700, color: "var(--text-secondary)",
  textTransform: "uppercase", letterSpacing: 0.8,
  display: "block", marginBottom: 6,
};

function Logo() {
  return (
    <div style={{ textAlign: "center", marginBottom: 28 }}>
      <div style={{ fontFamily: "Georgia,serif", fontSize: 34, color: hp }}>✦ Moli ✦</div>
      <div style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>Creator management for modern agencies</div>
    </div>
  );
}

function Btn({ onClick, children, variant = "primary", disabled, style: x }) {
  const base = {
    width: "100%", border: "none", borderRadius: 10,
    fontWeight: 700, padding: "12px 20px", fontSize: 14,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.6 : 1, transition: "all 0.15s",
    fontFamily: "inherit", ...x,
  };
  const v = {
    primary: { background: hp, color: "var(--bg-card)" },
    outline: { background: "transparent", color: hp, border: `1.5px solid ${hp}` },
    ghost: { background: "transparent", color: "var(--text-secondary)", border: `1px solid #e8e8e8` },
  };
  return <button onClick={onClick} disabled={disabled} style={{ ...base, ...v[variant] }}>{children}</button>;
}

function ErrorMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ background: "#fff0f0", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#f87171", marginBottom: 14 }}>{msg}</div>;
}

function SuccessMsg({ msg }) {
  if (!msg) return null;
  return <div style={{ background: "rgba(74,222,128,0.1)", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#4ade80", marginBottom: 14 }}>{msg}</div>;
}

// ─────────────────────────────────────────────
// GENERATE AGENCY CODE
// ─────────────────────────────────────────────

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "FILMIT-";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─────────────────────────────────────────────
// AGENCY SIGNUP
// ─────────────────────────────────────────────

function AgencySignup({ onBack, onSuccess }) {
  const [form, setForm] = useState({ email: "", password: "", confirm: "", agencyName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.email || !form.password || !form.agencyName) return setError("Please fill in all fields.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      const agencyCode = generateCode();

      // Sign up with Supabase Auth
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: "agency",
            agency_name: form.agencyName,
            agency_code: agencyCode,
          }
        }
      });

      if (signUpError) throw signUpError;

      // Insert into user_profiles
      const { error: profileError } = await supabase.from("user_profiles").insert({
        id: data.user.id,
        email: form.email,
        role: "agency",
        agency_name: form.agencyName,
        agency_code: agencyCode,
      });

      if (profileError) throw profileError;

      onSuccess({ agencyCode, email: form.email });
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={pageStyle}>
      <Logo />
      <div style={cardStyle}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Create Agency Account</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>You'll get a unique code to share with your creators</div>
        <ErrorMsg msg={error} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={labelSt}>Agency / Business Name</label><input value={form.agencyName} onChange={e => setForm(f => ({ ...f, agencyName: e.target.value }))} placeholder="Molitor Marketing" style={inputSt} /></div>
          <div><label style={labelSt}>Your Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@youragency.com" style={inputSt} /></div>
          <div><label style={labelSt}>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" style={inputSt} /></div>
          <div><label style={labelSt}>Confirm Password</label><input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat password" style={inputSt} /></div>
          <Btn onClick={handleSubmit} disabled={loading}>{loading ? "Creating account..." : "Create Agency Account"}</Btn>
          <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AGENCY CODE REVEAL
// ─────────────────────────────────────────────

function AgencyCodeReveal({ agencyCode, email, onContinue }) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(agencyCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={pageStyle}>
      <Logo />
      <div style={cardStyle}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Agency Account Created!</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Share this code with your creators so they can join your workspace</div>
        </div>
        <div style={{ background: "rgba(255,0,102,0.12)", border: `2px dashed ${hp}`, borderRadius: 14, padding: "20px", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Your Agency Code</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: 700, color: "#ff0066", letterSpacing: 3 }}>{agencyCode}</div>
          <button onClick={copy} style={{ background: "none", border: "none", color: hp, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 8 }}>
            {copied ? "✓ Copied!" : "Copy code"}
          </button>
        </div>
        <div style={{ background: "rgba(250,204,21,0.1)", border: "1px solid rgba(250,204,21,0.2)", borderRadius: 10, padding: "12px 14px", fontSize: 13, color: "var(--yellow)", marginBottom: 20 }}>
          <strong>Save this code!</strong> Your creators will need it to sign up. You can also find it later in your agency settings.
        </div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 16, textAlign: "center" }}>
          We sent a confirmation email to <strong>{email}</strong>. Please verify your email before signing in.
        </div>
        <Btn onClick={onContinue}>Go to Sign In</Btn>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CREATOR SIGNUP
// ─────────────────────────────────────────────

function CreatorSignup({ onBack, onSuccess }) {
  const [form, setForm] = useState({ email: "", password: "", confirm: "", name: "", agencyCode: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");
    if (!form.email || !form.password || !form.name || !form.agencyCode) return setError("Please fill in all fields.");
    if (form.password !== form.confirm) return setError("Passwords don't match.");
    if (form.password.length < 8) return setError("Password must be at least 8 characters.");

    setLoading(true);
    try {
      // Verify agency code exists
      const { data: agency, error: agencyError } = await supabase
        .from("user_profiles")
        .select("id, agency_name")
        .eq("agency_code", form.agencyCode.toUpperCase().trim())
        .eq("role", "agency")
        .single();

      if (agencyError || !agency) {
        setLoading(false);
        return setError("Invalid agency code. Please check with your agency.");
      }

      // Sign up
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: {
          data: {
            role: "creator",
            display_name: form.name,
            agency_id: agency.id,
          }
        }
      });

      if (signUpError) throw signUpError;

      // Insert profile
      const { error: profileError } = await supabase.from("user_profiles").insert({
        id: data.user.id,
        email: form.email,
        role: "creator",
        display_name: form.name,
        agency_id: agency.id,
        client_id: null, // Agency assigns this later
      });

      if (profileError) throw profileError;

      onSuccess({ agencyName: agency.agency_name, email: form.email });
    } catch (e) {
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  return (
    <div style={pageStyle}>
      <Logo />
      <div style={cardStyle}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "var(--text)", marginBottom: 6 }}>Creator Sign Up</div>
        <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 22 }}>You'll need the agency code your manager gave you</div>
        <ErrorMsg msg={error} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div><label style={labelSt}>Your Name</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Jessica M." style={inputSt} /></div>
          <div><label style={labelSt}>Your Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="you@email.com" style={inputSt} /></div>
          <div><label style={labelSt}>Password</label><input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Min. 8 characters" style={inputSt} /></div>
          <div><label style={labelSt}>Confirm Password</label><input type="password" value={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Repeat password" style={inputSt} /></div>
          <div>
            <label style={labelSt}>Agency Code</label>
            <input value={form.agencyCode} onChange={e => setForm(f => ({ ...f, agencyCode: e.target.value }))}
              placeholder="FILMIT-XXXXXX" style={{ ...inputSt, fontFamily: "monospace", letterSpacing: 2, textTransform: "uppercase" }} />
            <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>Ask your agency manager for this code</div>
          </div>
          <Btn onClick={handleSubmit} disabled={loading}>{loading ? "Creating account..." : "Create Creator Account"}</Btn>
          <Btn variant="ghost" onClick={onBack}>← Back</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CREATOR PENDING
// ─────────────────────────────────────────────

function CreatorPending({ agencyName, email, onSignIn }) {
  return (
    <div style={pageStyle}>
      <Logo />
      <div style={cardStyle}>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
          <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "var(--text)", marginBottom: 8 }}>You're signed up!</div>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 20, lineHeight: 1.6 }}>
            Your account has been linked to <strong>{agencyName}</strong>. We sent a confirmation to <strong>{email}</strong> — verify your email then sign in.<br /><br />
            Your agency will assign you to your board shortly.
          </div>
          <Btn onClick={onSignIn}>Go to Sign In</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("login"); // login | choose-signup | agency-signup | creator-signup | agency-code | creator-pending

  const [agencyCode, setAgencyCode] = useState("");
  const [agencyEmail, setAgencyEmail] = useState("");
  const [creatorAgencyName, setCreatorAgencyName] = useState("");
  const [creatorEmail, setCreatorEmail] = useState("");

  const handleLogin = async () => {
    setError("");
    if (!email || !password) return setError("Please enter your email and password.");
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;

      // Get profile
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("id", data.user.id)
        .single();

      if (!profile) throw new Error("Account setup incomplete. Contact your agency.");

      onLogin({
        id: data.user.id,
        email: data.user.email,
        role: profile.role,
        clientId: profile.client_id,
        agencyId: profile.agency_id,
        agencyCode: profile.agency_code,
        agencyName: profile.agency_name,
        displayName: profile.display_name,
        name: profile.agency_name || profile.display_name,
      });
    } catch (e) {
      setError(e.message === "Invalid login credentials" ? "Incorrect email or password." : e.message);
    }
    setLoading(false);
  };

  if (view === "choose-signup") return (
    <div style={pageStyle}>
      <Logo />
      <div style={cardStyle}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 20, color: "var(--text)", marginBottom: 20 }}>Create an Account</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <button onClick={() => setView("agency-signup")} style={{ padding: "16px 20px", borderRadius: 14, border: "1px solid var(--border)", background: "rgba(255,0,102,0.12)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = hp} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
            <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 15 }}>🏢 I'm an Agency / Manager</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>Create a workspace and invite your creators</div>
          </button>
          <button onClick={() => setView("creator-signup")} style={{ padding: "16px 20px", borderRadius: 14, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.borderColor = hp} onMouseLeave={e => e.currentTarget.style.borderColor = border}>
            <div style={{ fontWeight: 800, color: "var(--text)", fontSize: 15 }}>🎬 I'm a Creator</div>
            <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 3 }}>Join your agency's workspace with their code</div>
          </button>
          <Btn variant="ghost" onClick={() => setView("login")}>← Back to Sign In</Btn>
        </div>
      </div>
    </div>
  );

  if (view === "agency-signup") return (
    <AgencySignup
      onBack={() => setView("choose-signup")}
      onSuccess={({ agencyCode, email }) => { setAgencyCode(agencyCode); setAgencyEmail(email); setView("agency-code"); }}
    />
  );

  if (view === "agency-code") return (
    <AgencyCodeReveal agencyCode={agencyCode} email={agencyEmail} onContinue={() => setView("login")} />
  );

  if (view === "creator-signup") return (
    <CreatorSignup
      onBack={() => setView("choose-signup")}
      onSuccess={({ agencyName, email }) => { setCreatorAgencyName(agencyName); setCreatorEmail(email); setView("creator-pending"); }}
    />
  );

  if (view === "creator-pending") return (
    <CreatorPending agencyName={creatorAgencyName} email={creatorEmail} onSignIn={() => setView("login")} />
  );

  // Main login — split layout
  return (
    <div style={{ minHeight:"100vh", background:"#fff0f6", display:"flex", alignItems:"center", justifyContent:"center", padding:24 }}>
      <div style={{ width:"100%", maxWidth:820, display:"flex", borderRadius:20, overflow:"hidden", border:"1px solid rgba(255,255,255,0.06)" }}>

        {/* Left — form */}
        <div style={{ flex:1, background:"#ffffff", padding:"48px 40px", display:"flex", flexDirection:"column", justifyContent:"center" }}>
          <div style={{ marginBottom:40 }}>
            <div style={{ fontFamily:"Georgia,serif", fontSize:28, color:"#fff", letterSpacing:-1, marginBottom:6 }}>✦ <span style={{ color:hp }}>Moli</span></div>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.35)", letterSpacing:0.3 }}>Creator management for modern agencies</div>
          </div>

          <ErrorMsg msg={error} />

          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="you@agency.com"
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}
            />
          </div>
          <div style={{ marginBottom:24 }}>
            <label style={{ fontSize:11, fontWeight:700, color:"rgba(255,255,255,0.5)", textTransform:"uppercase", letterSpacing:0.8, display:"block", marginBottom:6 }}>Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="••••••••"
              style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:10, padding:"12px 14px", color:"#fff", fontSize:14, outline:"none", boxSizing:"border-box" }}
            />
          </div>

          <button
            onClick={handleLogin} disabled={loading}
            style={{ width:"100%", background:hp, border:"none", borderRadius:10, padding:"13px", color:"#fff", fontWeight:700, fontSize:14, cursor:loading?"not-allowed":"pointer", opacity:loading?0.7:1, marginBottom:16 }}
          >{loading ? "Signing in..." : "Sign In"}</button>

          <div style={{ textAlign:"center", fontSize:13, color:"rgba(255,255,255,0.3)" }}>
            Don't have an account?{" "}
            <button onClick={() => setView("choose-signup")} style={{ background:"none", border:"none", color:hp, fontWeight:700, cursor:"pointer", fontSize:13 }}>Sign up free</button>
          </div>
        </div>

        {/* Right — pink accent panel */}
        <div style={{ width:240, background:`linear-gradient(135deg, ${hp} 0%, #cc0052 100%)`, display:"flex", flexDirection:"column", justifyContent:"space-between", padding:32, position:"relative", overflow:"hidden" }}>
          <div style={{ position:"absolute", top:-40, right:-40, width:160, height:160, borderRadius:"50%", background:"rgba(255,255,255,0.08)" }}/>
          <div style={{ position:"absolute", top:40, right:20, width:80, height:80, borderRadius:"50%", background:"rgba(255,255,255,0.06)" }}/>
          <div style={{ position:"relative" }}>
            <div style={{ fontSize:13, color:"rgba(255,255,255,0.8)", fontWeight:600, marginBottom:4 }}>✦ Moli</div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.5)", lineHeight:1.5 }}>The all-in-one platform for creator agencies</div>
          </div>
          <div style={{ position:"relative" }}>
            <div>
              <div style={{ fontSize:32, fontWeight:700, color:"#fff", lineHeight:1.1, marginBottom:12 }}>Manage<br/>Creators.</div>
              <div style={{ fontSize:16, color:"rgba(255,255,255,0.7)", fontWeight:500 }}>Join Now.</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN APP WRAPPER
// ─────────────────────────────────────────────

export default function FilmItApp() {
  const [userInfo, setUserInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check for existing session on load
  useEffect(() => {
    async function checkSession() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("*")
          .eq("id", session.user.id)
          .single();
        if (profile) {
          setUserInfo({
            id: session.user.id,
            email: session.user.email,
            role: profile.role,
            clientId: profile.client_id,
            agencyId: profile.agency_id,
            agencyCode: profile.agency_code,
            agencyName: profile.agency_name,
            displayName: profile.display_name,
            name: profile.agency_name || profile.display_name,
          });
        }
      }
      setLoading(false);
    }
    checkSession();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserInfo(null);
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "Georgia,serif", fontSize: 28, color: hp, marginBottom: 12 }}>✦ Moli ✦</div>
        <div style={{ color: "#ccc", fontSize: 14 }}>Loading...</div>
      </div>
    </div>
  );

  if (!userInfo) return <LoginScreen onLogin={setUserInfo} />;

  return <FilmIt userInfo={userInfo} onLogout={handleLogout} />;
}
