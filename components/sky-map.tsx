"use client";
import { useEffect, useRef, useState } from "react";
import type L from "leaflet";
import { LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { aeroGrade } from "@/lib/aero-grade";
import { Aircraft, Position, Settings, number } from "@/lib/skyglow";
export default function SkyMap({
  aircraft,
  settings,
  onSelect,
  tracks = [],
}: {
  aircraft: Aircraft[];
  settings: Settings;
  onSelect: (a: Aircraft) => void;
  tracks?: Position[];
}) {
  const node = useRef<HTMLDivElement>(null),
    map = useRef<L.Map | null>(null),
    layer = useRef<L.LayerGroup | null>(null),
    lib = useRef<typeof L | null>(null);
  const latest = useRef({ settings, onSelect });
  latest.current = { settings, onSelect };
  const [ready, setReady] = useState(false),
    [tileError, setTileError] = useState(false);
  useEffect(() => {
    let canceled = false;
    let observer: ResizeObserver | undefined;
    import("leaflet").then((L) => {
      if (canceled || !node.current) return;
      lib.current = L;
      const s = latest.current.settings;
      const m = L.map(node.current, { zoomControl: false, preferCanvas: true }).setView(
        [s.latitude ?? 20, s.longitude ?? 0],
        s.latitude == null ? 2 : 8,
      );
      map.current = m;
      const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
        className: "skyglow-basemap",
        maxZoom: 19,
      });
      tiles.on("tileerror", () => setTileError(true));
      tiles.on("load", () => {});
      tiles.addTo(m);
      L.control.zoom({ position: "bottomright" }).addTo(m);
      layer.current = L.layerGroup().addTo(m);
      observer = new ResizeObserver(() => m.invalidateSize());
      observer.observe(node.current);
      setReady(true);
    });
    return () => {
      canceled = true;
      observer?.disconnect();
      map.current?.remove();
      map.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !lib.current || !layer.current) return;
    const L = lib.current,
      g = layer.current;
    g.clearLayers();
    if (settings.latitude != null && settings.longitude != null) {
      L.circle([settings.latitude, settings.longitude], {
        radius: settings.alert_nm * 1852,
        color: "#a5b8fd",
        weight: 1,
        opacity: 0.55,
        fillOpacity: 0.035,
        dashArray: "4 7",
      }).addTo(g);
      L.circleMarker([settings.latitude, settings.longitude], {
        radius: 5,
        fillColor: "#e8edff",
        color: "#8ba1f2",
        weight: 5,
        fillOpacity: 1,
      })
        .bindTooltip("Your receiver")
        .addTo(g);
    }
    const groups = new Map<string, Position[]>();
    for (const p of tracks) {
      const list = groups.get(p[1]) ?? [];
      list.push(p);
      groups.set(p[1], list);
    }
    for (const points of groups.values()) {
      let line: [number, number][] = [];
      let previous = 0;
      for (const p of points) {
        if (previous && p[0] - previous > 300) {
          if (line.length > 1)
            L.polyline(line, { color: "#e7a664", weight: 1.5, opacity: 0.35 }).addTo(g);
          line = [];
        }
        line.push([p[3], p[4]]);
        previous = p[0];
      }
      if (line.length > 1)
        L.polyline(line, { color: "#e7a664", weight: 1.5, opacity: 0.4 }).addTo(g);
    }
    for (const a of aircraft) {
      if (a.lat == null || a.lon == null) continue;
      const grade = aeroGrade(a);
      const label = document.createElement("div");
      label.textContent =
        (a.flight || a.hex) +
        " · " +
        (typeof a.alt === "number" ? number(a.alt) + " ft" : (a.alt ?? "altitude unknown")) +
        ` · AeroGrade ${grade.score}`;
      const el = document.createElement("div");
      el.className = "aircraft-marker";
      const arrow = document.createElement("span");
      arrow.textContent = "▲";
      arrow.style.transform = `rotate(${a.track ?? 0}deg)`;
      el.appendChild(arrow);
      L.marker([a.lat, a.lon], {
        icon: L.divIcon({
          className: "aircraft-icon",
          html: el,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        }),
        title: a.flight || a.hex,
      })
        .addTo(g)
        .bindTooltip(label, { direction: "top" })
        .on("click", () => latest.current.onSelect(a));
    }
  }, [ready, aircraft, tracks, settings.latitude, settings.longitude, settings.alert_nm]);
  return (
    <div className="map-wrap">
      <div
        ref={node}
        className="sky-map"
        aria-label="Aircraft map. Pinch to zoom; tap an aircraft for details."
      />
      <div className="map-caption">
        <span className="tiny-dot" />
        {aircraft.filter((a) => a.lat != null).length} positioned
      </div>
      <Button
        className="map-center"
        variant="secondary"
        aria-label="Center on my receiver"
        onClick={() => {
          if (settings.latitude != null && settings.longitude != null)
            map.current?.setView([settings.latitude, settings.longitude], 9);
        }}
      >
        <LocateFixed />
      </Button>
      {tileError && (
        <p className="map-warning">Map tiles are unavailable. Aircraft positions still update.</p>
      )}
    </div>
  );
}
