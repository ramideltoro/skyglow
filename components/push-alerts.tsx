"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { post } from "@/lib/skyglow";
export default function PushAlerts({ canControl }: { canControl: boolean }) {
  const [supported, setSupported] = useState(false),
    [enabled, setEnabled] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    const ok = "PushManager" in window && "Notification" in window && "serviceWorker" in navigator;
    setSupported(ok);
    if (ok)
      navigator.serviceWorker.ready
        .then((r) => r.pushManager.getSubscription())
        .then((s) => setEnabled(!!s))
        .catch(() => {});
  }, []);
  async function toggle() {
    setBusy(true);
    setMessage("");
    try {
      if (!enabled) {
        const permission = await Notification.requestPermission();
        if (permission !== "granted")
          throw new Error(
            "Notifications are disabled. Enable them in your iPhone settings to receive alerts.",
          );
      }
      const registration = await navigator.serviceWorker.ready;
      if (enabled) {
        const sub = await registration.pushManager.getSubscription();
        if (sub) {
          await post("push", { endpoint: sub.endpoint, remove: true });
          await sub.unsubscribe();
        }
        setEnabled(false);
        return;
      }
      const response = await fetch("/api/push-key");
      const { key } = (await response.json()) as { key: string };
      const raw = atob(key.replace(/-/g, "+").replace(/_/g, "/"));
      const bytes = Uint8Array.from(raw, (c) => c.charCodeAt(0));
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: bytes,
      });
      await post("push", sub.toJSON());
      setEnabled(true);
      setMessage("Overhead alerts are enabled for this device.");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not enable notifications.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="push-alerts">
      <h3>Alerts on your iPhone</h3>
      <p className="supporting">
        Add Skyglow to your Home Screen in Safari, open it there, then enable notifications. Your
        Mac must stay awake and in aircraft mode.
      </p>
      {supported ? (
        <Button variant="secondary" disabled={busy || !canControl} onClick={toggle}>
          <Bell />
          {busy ? "Updating…" : enabled ? "Disable phone alerts" : "Enable phone alerts"}
        </Button>
      ) : (
        <p className="supporting">
          Phone notifications require the Home Screen app on iOS 16.4 or later.
        </p>
      )}
      {message && (
        <p className="supporting" role="status">
          {message}
        </p>
      )}
    </div>
  );
}
