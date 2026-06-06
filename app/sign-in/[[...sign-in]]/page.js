import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #fff0f6 0%, #fce8f0 100%)",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    }}>
      <div style={{ fontFamily: "Georgia, serif", fontSize: 36, color: "#ff0066", marginBottom: 8 }}>
        ✦ FilmIt ✦
      </div>
      <div style={{ fontSize: 14, color: "#999", marginBottom: 32 }}>
        Content workflow for creators & agencies
      </div>
      <SignIn />
    </div>
  );
}
