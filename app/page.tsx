"use client";

import { lazy, Suspense } from "react";

const ObservatoryView = lazy(() => import("@/components/observatory-view"));

export default function App() {
  return (
    <Suspense
      fallback={
        <main className="login-page">
          <p className="login-connecting" role="status">
            Opening the observatory…
          </p>
        </main>
      }
    >
      <ObservatoryView />
    </Suspense>
  );
}
