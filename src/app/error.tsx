"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return <main style={{ maxWidth: 560, margin: "15vh auto", padding: 32, fontFamily: "system-ui" }}><p style={{ color: "#35675a", letterSpacing: 2 }}>REVISIT</p><h1>The workspace is unavailable.</h1><p>Start the local database and worker with <code>npm run demo</code>, then retry. Your saved reviews remain in the database.</p><button onClick={reset} style={{ padding: "12px 20px", borderRadius: 6, border: 0, background: "#24594e", color: "white", cursor: "pointer" }}>Try again</button></main>;
}
