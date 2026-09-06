"use client";

import { useState } from "react";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { post } from "@/lib/skyglow";

export default function OwnerLogin({ onSignedIn }: { onSignedIn: () => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="owner-login-form"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError("");
        try {
          await post("login", { username: "sqwak", password });
          setPassword("");
          await onSignedIn();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Sign-in failed.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="owner-login-message">
        <span>
          <LockKeyhole />
        </span>
        <div>
          <strong>Public visitors have read-only access</strong>
          <p>Only the owner account can change settings or operate the radio.</p>
        </div>
      </div>
      <label className="field" htmlFor="owner-username">
        Username
        <input
          id="owner-username"
          name="username"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          readOnly
          value="sqwak"
        />
      </label>
      <label className="field" htmlFor="owner-password">
        Password
        <input
          id="owner-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          maxLength={1024}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      {error && (
        <p className="login-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="login-button login-submit">
        {busy ? "Signing in…" : "Unlock owner controls"}
        <ArrowRight />
      </button>
    </form>
  );
}
