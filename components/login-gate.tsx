"use client";
import { useCallback, useEffect, useState } from "react";
import { RadioTower, ArrowRight } from "lucide-react";
import { post } from "@/lib/skyglow";

export default function LoginGate({
  children,
}: {
  children: (onSignedOut: () => void) => React.ReactNode;
}) {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signedOut = useCallback(() => {
    setAuthenticated(false);
    setPassword("");
    setError("");
  }, []);
  const checkSession = useCallback(async () => {
    try {
      const r = await fetch("/api/session", { cache: "no-store" });
      if (!r.ok) throw new Error("Skyglow is unavailable. Check that your Mac is online.");
      const session = (await r.json()) as { authenticated: boolean };
      setAuthenticated(session.authenticated);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to connect.");
    }
  }, []);
  useEffect(() => {
    checkSession();
  }, [checkSession]);
  if (authenticated) return children(signedOut);
  return (
    <main className="login-page">
      <div className="login-brand">
        <span className="logo">
          <RadioTower size={24} />
        </span>
        skyglow<span>.</span>
      </div>
      <section className="login-card">
        <p className="eyebrow">YOUR RADIO OBSERVATORY</p>
        <h1>Sign in to Skyglow.</h1>
        <p className="login-description">One place for your sky and the signals around you.</p>
        {authenticated === null ? (
          <div className="login-connecting">
            <p role="status">{error || "Connecting to your station…"}</p>
            {error && (
              <button className="login-button" onClick={checkSession}>
                Try again
              </button>
            )}
          </div>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              try {
                await post("login", { username, password });
                setPassword("");
                setAuthenticated(true);
              } catch (e) {
                setError(e instanceof Error ? e.message : "Sign-in failed.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <label className="field" htmlFor="login-username">
              Username
              <input
                id="login-username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                maxLength={128}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </label>
            <label className="field" htmlFor="login-password">
              Password
              <input
                id="login-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={1024}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && (
              <p className="login-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="login-button login-submit">
              {busy ? "Signing in…" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
        )}
      </section>
      <p className="login-footer">Your receiver. Every wavelength.</p>
    </main>
  );
}
