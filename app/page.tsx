"use client";

import { lazy, Suspense } from "react";
import LoginGate from "@/components/login-gate";

const ObservatoryView = lazy(() => import("@/components/observatory-view"));

export default function App() {
  return (
    <LoginGate>
      {(onSignedOut) => (
        <Suspense
          fallback={
            <main className="login-page">
              <p className="login-connecting" role="status">
                Opening your observatory…
              </p>
            </main>
          }
        >
          <ObservatoryView onSignedOut={onSignedOut} />
        </Suspense>
      )}
    </LoginGate>
  );
}
