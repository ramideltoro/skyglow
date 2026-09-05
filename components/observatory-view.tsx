"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  AudioLines,
  Bell,
  ChevronDown,
  ChevronRight,
  Headphones,
  History,
  Orbit,
  Pause,
  Plane,
  Play,
  RadioTower,
  Satellite,
  Settings2,
  Signal,
  Sunrise,
  Thermometer,
  Wifi,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import SkyMap from "@/components/sky-map";
import PushAlerts from "@/components/push-alerts";
import SiteFooter from "@/components/site-footer";
import {
  Aircraft,
  ListenBand,
  Mode,
  Position,
  Reading,
  Sensor,
  Settings,
  Snapshot,
  clock,
  modeNames,
  number,
  post,
} from "@/lib/skyglow";

const tabs = [
  { id: "sky", name: "Sky", icon: Plane },
  { id: "replay", name: "Replay", icon: History },
  { id: "listen", name: "Listen", icon: Headphones },
  { id: "space", name: "Space", icon: Orbit },
  { id: "sensors", name: "Sensors", icon: Wifi },
];
const frequencyLabel = (d: Snapshot) =>
  d.receiver.mode === "aircraft" ? "1090 MHz" : `${d.receiver.options.frequency ?? "—"} MHz`;
const radioPresets: { name: string; frequency: string; band: ListenBand }[] = [
  { name: "Tampa weather", frequency: "162.550", band: "weather" },
  { name: "Tampa Tower", frequency: "119.500", band: "airband" },
  { name: "Airport report", frequency: "126.450", band: "airband" },
];
const ago = (t: number) => {
  const m = Math.max(0, Math.floor((Date.now() / 1000 - t) / 60));
  return m < 1 ? "Just now" : m < 60 ? `${m}m ago` : `${Math.floor(m / 60)}h ago`;
};
function Empty({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Plane;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>
        {value}
        <small>{unit}</small>
      </strong>
    </div>
  );
}
function AircraftCard({ a, onClick }: { a: Aircraft; onClick: () => void }) {
  return (
    <button className="aircraft-row" onClick={onClick}>
      <span className="row-icon">
        <Plane size={19} />
      </span>
      <span>
        <strong>{a.flight || a.hex.toUpperCase()}</strong>
        <small>
          {a.hex.toUpperCase()} ·{" "}
          {a.bearing == null ? "Position unavailable" : `${a.bearing}° bearing`}
        </small>
      </span>
      <span className="right">
        <strong>
          {number(a.distance, 1)} <small>nm</small>
        </strong>
        <small>
          {typeof a.alt === "number"
            ? `${number(a.alt)} ft`
            : a.alt === "ground"
              ? "On the ground"
              : "Altitude unavailable"}
        </small>
      </span>
      <ChevronRight size={16} />
    </button>
  );
}

export default function ObservatoryView({ onSignedOut }: { onSignedOut: () => void }) {
  const [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState("sky"),
    [station, setStation] = useState(false),
    [modeSheet, setModeSheet] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<Aircraft | null>(null),
    [sound, setSound] = useState(false);
  const [newMode, setNewMode] = useState<Mode>("aircraft"),
    [frequency, setFrequency] = useState("162.550"),
    [listenBand, setListenBand] = useState<ListenBand>("weather"),
    [sensorBand, setSensorBand] = useState("433.92"),
    [satFrequency, setSatFrequency] = useState("137.1"),
    [satRate, setSatRate] = useState("72"),
    [minutes, setMinutes] = useState("15");
  const [draft, setDraft] = useState<Settings | null>(null),
    [log, setLog] = useState("");
  const audioContext = useRef<AudioContext | null>(null),
    lastAlert = useRef(Date.now() / 1000),
    noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (message: string) => {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 9000);
  };
  const refresh = async () => {
    try {
      const r = await fetch("/api/snapshot", { cache: "no-store" });
      if (r.status === 401) {
        onSignedOut();
        return;
      }
      if (!r.ok) throw new Error("Receiver unavailable");
      setData(await r.json());
      setError("");
    } catch {
      setError("Connection lost. Showing the last received data.");
    }
  };
  useEffect(() => {
    let gone = false;
    const poll = async () => {
      if (!gone) await refresh();
    };
    poll();
    const timer = setInterval(poll, 3000);
    const wake = () => {
      if (document.visibilityState === "visible") poll();
    };
    document.addEventListener("visibilitychange", wake);
    navigator.serviceWorker?.register("/sw.js").catch(() => {});
    return () => {
      gone = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, []);
  useEffect(() => {
    const a = data?.alerts[0];
    if (!a || a.t <= lastAlert.current) return;
    lastAlert.current = a.t;
    flash(`${a.flight || a.hex} is ${number(a.distance, 1)} nm from your receiver.`);
    if (sound && audioContext.current) {
      const ctx = audioContext.current;
      const osc = ctx.createOscillator(),
        gain = ctx.createGain();
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.5);
    }
  }, [data?.alerts, sound]);
  const action = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };
  const choose = (m: Mode) => {
    setNewMode(m);
    if (m === "listen" && data?.receiver.mode === "listen") {
      setListenBand(data.receiver.options.band ?? "airband");
      setFrequency(Number(data.receiver.options.frequency).toFixed(3));
    }
    if (m === "satellite" && Number(minutes) > 20) setMinutes("15");
    setModeSheet(true);
  };
  const switchMode = () =>
    action(async () => {
      await post("mode", {
        mode: newMode,
        minutes: Number(minutes),
        frequency: Number(
          newMode === "listen" ? frequency : newMode === "satellite" ? satFrequency : sensorBand,
        ),
        rate: satRate,
        band: listenBand,
      });
      setModeSheet(false);
      if (newMode === "listen") setTab("listen");
      if (newMode === "satellite") setTab("space");
      if (newMode === "sensors") setTab("sensors");
      flash(`${modeNames[newMode]} reception started.`);
    });
  const controls = !!data?.can_control;
  const sessionNote = data?.receiver.until
    ? `Aircraft resumes at ${clock(data.receiver.until)}`
    : "Feeding airplanes.live";
  if (!data)
    return (
      <main className="connecting">
        <RadioTower size={42} />
        <h1>Skyglow</h1>
        <p>{error || "Connecting to your observatory…"}</p>
        <Button onClick={refresh}>Reconnect</Button>
      </main>
    );
  const live =
    !error &&
    data.receiver.mode === "aircraft" &&
    !data.receiver.switching &&
    data.source_age != null &&
    data.source_age < 20;
  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="wordmark" href="/#sky" onClick={() => setTab("sky")}>
          <span className="logo">
            <RadioTower size={24} />
          </span>
          skyglow<span className="brand-dot">.</span>
        </a>
        <Button
          variant="ghost"
          className="station-button"
          onClick={() => {
            setDraft(data.settings);
            setStation(true);
          }}
          aria-label="Station settings"
        >
          <Settings2 size={20} />
          <span>Station</span>
        </Button>
      </header>
      <button className="receiver-bar" onClick={() => choose(data.receiver.mode)}>
        <span className={"status-light " + (error ? "offline" : "")} />
        <span>
          <strong>
            {data.receiver.switching ? "Switching receiver…" : modeNames[data.receiver.mode]}
          </strong>
          <small>{error ? "Mac connection unavailable" : sessionNote}</small>
        </span>
        <span className="frequency">{frequencyLabel(data)}</span>
        <ChevronDown size={18} />
      </button>
      {error && (
        <p role="alert" className="banner danger">
          {error}
        </p>
      )}
      {data.receiver.error && <p className="banner danger">{data.receiver.error}</p>}
      <Tabs value={tab} onValueChange={(v) => setTab(String(v))} className="main-tabs">
        <TabsList className="bottom-nav" aria-label="Observatory views">
          {tabs.map(({ id, name, icon: Icon }) => (
            <TabsTrigger value={id} key={id}>
              <Icon />
              <span>{name}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="sky">
          <div className="page-heading">
            <div>
              <p className="eyebrow">YOUR AIRSPACE</p>
              <h1>Look up.</h1>
            </div>
            <span className={"badge " + (live ? "" : "muted")}>
              <span className="tiny-dot" />
              {live ? "Live reception" : "Reception paused"}
            </span>
          </div>
          <SkyMap
            aircraft={live ? data.aircraft : []}
            settings={data.settings}
            onSelect={setSelected}
          />
          <div className="stats-strip">
            <Stat label="In range" value={number(live ? data.aircraft.length : 0)} />
            <Stat label="Seen in 24h" value={number(data.stats.aircraft_24h)} />
            <Stat label="Range record" value={number(data.stats.farthest_nm, 1)} unit="nm" />
          </div>
          {!live && (
            <div className="banner">
              <p>
                {data.receiver.mode === "aircraft"
                  ? "Waiting for fresh aircraft signals. Check the antenna and USB connection."
                  : `${modeNames[data.receiver.mode]} is using the receiver. Your saved flights are available in Replay.`}
              </p>
              {data.receiver.mode !== "aircraft" && (
                <Button variant="secondary" onClick={() => choose("aircraft")}>
                  Resume aircraft
                </Button>
              )}
            </div>
          )}
          <div className="two-col">
            <section className="panel">
              <div className="section-heading">
                <h2>Nearby aircraft</h2>
                <span>{data.aircraft.length} signals</span>
              </div>
              {live && data.aircraft.length ? (
                data.aircraft
                  .slice(0, 20)
                  .map((a) => <AircraftCard key={a.hex} a={a} onClick={() => setSelected(a)} />)
              ) : (
                <Empty icon={Plane} title="The sky will appear here">
                  Aircraft show up as your antenna receives their broadcasts.
                </Empty>
              )}
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>
                  <Bell size={18} /> Overhead alerts
                </h2>
                <Switch
                  aria-label="Alert sound while Skyglow is open"
                  checked={sound}
                  onCheckedChange={(on) => {
                    setSound(on);
                    if (on) {
                      audioContext.current ??= new AudioContext();
                      audioContext.current.resume();
                    }
                  }}
                />
              </div>
              <p className="supporting">
                Within {data.settings.alert_nm} nautical miles. Sound plays while this page is open.
              </p>
              {data.alerts.length ? (
                data.alerts.slice(0, 6).map((a) => (
                  <div className="alert-row" key={a.t + "-" + a.hex}>
                    <span className="event-dot" />
                    <div>
                      <strong>{a.flight || a.hex.toUpperCase()}</strong>
                      <p>
                        {number(a.distance, 1)} nm away · {number(a.alt)} ft
                      </p>
                    </div>
                    <small>{ago(a.t)}</small>
                  </div>
                ))
              ) : (
                <Empty icon={Bell} title="Listening for a close pass">
                  Your next overhead aircraft will be logged here.
                </Empty>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="replay">
          <Replay data={data} onSelect={setSelected} />
        </TabsContent>
        <TabsContent value="listen">
          <div className="page-heading">
            <div>
              <p className="eyebrow">LOCAL RADIO</p>
              <h1>On the air.</h1>
            </div>
            <Headphones className="heading-icon" />
          </div>
          <section className="radio-panel">
            <div className="radio-art">
              <AudioLines size={76} strokeWidth={0.8} />
            </div>
            <span className="eyebrow">
              {(data.receiver.mode === "listen" ? data.receiver.options.band : listenBand) ===
              "weather"
                ? "FM · NOAA WEATHER"
                : "AM · VHF AIRBAND"}
            </span>
            <div className="dial-number">
              {data.receiver.mode === "listen"
                ? Number(data.receiver.options.frequency).toFixed(3)
                : Number(frequency).toFixed(3)}
              <small>MHz</small>
            </div>
            <p>
              {data.receiver.mode === "listen"
                ? "Receiver tuned. Tap play to listen."
                : "Listen to Tampa weather or nearby aircraft."}
            </p>
            <div className="dial-ticks" aria-hidden="true" />
            {data.receiver.mode === "listen" && controls ? (
              <>
                <audio
                  key={data.receiver.since}
                  className="radio-audio"
                  controls
                  playsInline
                  src={
                    data.receiver.audio_ready
                      ? `/media/audio/live.m3u8?session=${data.receiver.since}`
                      : undefined
                  }
                  preload="none"
                />
                <p className="supporting">
                  {data.receiver.audio_ready
                    ? "Live audio has a short buffering delay."
                    : "Preparing the audio stream…"}
                </p>
                <Button variant="secondary" onClick={() => choose("aircraft")}>
                  Stop & return to aircraft
                </Button>
                <Button variant="secondary" onClick={() => choose("listen")}>
                  Change frequency
                </Button>
              </>
            ) : (
              <Button onClick={() => choose("listen")}>
                <Headphones /> Tune receiver
              </Button>
            )}
          </section>
          <div className="radio-presets" aria-label="Tampa radio presets">
            {radioPresets.map((preset) => (
              <Button
                key={preset.name}
                variant="secondary"
                onClick={() => {
                  setNewMode("listen");
                  setListenBand(preset.band);
                  setFrequency(preset.frequency);
                  setModeSheet(true);
                }}
              >
                {preset.name} · {preset.frequency}
              </Button>
            ))}
          </div>
          <section className="panel padded">
            <h2>Your listening setup</h2>
            <p>
              Start with Tampa weather on 162.550 FM for a continuous broadcast. Aircraft use AM
              from 118.000–136.975 MHz and may be quiet between calls. Reception depends on your
              antenna and distance.
            </p>
            <p>
              Use the longer antenna element for this band. Aircraft tracking pauses during audio
              reception.
            </p>
            <a
              href="https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dafd/"
              target="_blank"
              rel="noreferrer"
            >
              Find airport frequencies in the FAA Chart Supplement <ArrowUpRight size={15} />
            </a>
          </section>
        </TabsContent>
        <TabsContent value="space">
          <div className="page-heading">
            <div>
              <p className="eyebrow">DIRECT FROM ORBIT</p>
              <h1>Catch a passing world.</h1>
            </div>
            <Orbit className="heading-icon" />
          </div>
          <section className="satellite-panel">
            <span className="satellite-symbol">
              <Satellite size={44} strokeWidth={1} />
            </span>
            <div>
              <span className="eyebrow">METEOR-M2 4</span>
              <h2>
                {data.receiver.mode === "satellite"
                  ? "Capture in progress"
                  : "Your next satellite pass"}
              </h2>
              {data.orbital.passes[0] ? (
                <p>
                  <strong>
                    {new Date(data.orbital.passes[0].rise * 1000).toLocaleDateString([], {
                      weekday: "short",
                    })}{" "}
                    {clock(data.orbital.passes[0].rise)}
                  </strong>{" "}
                  · {data.orbital.passes[0].elevation}° peak elevation
                </p>
              ) : (
                <p>{data.orbital.message}</p>
              )}
            </div>
            <Button
              onClick={() => choose(data.receiver.mode === "satellite" ? "aircraft" : "satellite")}
            >
              {data.receiver.mode === "satellite" ? "Finish capture" : "Start capture"}
              <ChevronRight size={17} />
            </Button>
          </section>
          <div className="banner">
            <p>
              For imagery, use an outdoor antenna suited to 137 MHz with a clear sky view. Start
              during a pass; images appear only when enough satellite data is decoded.
            </p>
          </div>
          <div className="two-col">
            <section className="panel">
              <div className="section-heading">
                <h2>Upcoming passes</h2>
                <Sunrise size={19} />
              </div>
              <p className="supporting">{data.orbital.message}</p>
              {data.orbital.passes.slice(0, 6).map((p) => (
                <div className="pass-row" key={p.rise}>
                  <div>
                    <strong>
                      {new Date(p.rise * 1000).toLocaleDateString([], {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </strong>
                    <small>
                      {clock(p.rise)}–{clock(p.set)}
                    </small>
                  </div>
                  <div className="pass-elevation">
                    <span style={{ width: `${p.elevation}%` }} />
                  </div>
                  <strong>{p.elevation}°</strong>
                </div>
              ))}
              <div className="panel-link">
                <a
                  href="https://ub8qbd.satdump.org/wx_report_new.html"
                  target="_blank"
                  rel="noreferrer"
                >
                  Check transmission status <ArrowUpRight size={15} />
                </a>
              </div>
            </section>
            <section className="panel">
              <div className="section-heading">
                <h2>Your captures</h2>
                <span>{data.captures.length} sessions</span>
              </div>
              {data.captures.length ? (
                data.captures.map((c) => (
                  <article className="capture" key={c.id}>
                    <div className="capture-meta">
                      <strong>
                        {new Date(c.started * 1000).toLocaleDateString([], {
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        · {clock(c.started)}
                      </strong>
                      <span>
                        {c.status === "capturing"
                          ? "Receiving"
                          : c.status === "processing"
                            ? "Processing"
                            : c.images.length
                              ? "Decoded"
                              : c.status === "decode_failed"
                                ? "Decode failed"
                                : "No image decoded"}
                      </span>
                    </div>
                    {c.images.length ? (
                      <div className="image-grid">
                        {c.images.map((i) => (
                          <a href={i.url} key={i.url} target="_blank" rel="noreferrer">
                            <img src={i.url} alt={i.name.replaceAll("_", " ")} loading="lazy" />
                            <span>{i.name.replaceAll("_", " ")}</span>
                          </a>
                        ))}
                      </div>
                    ) : (
                      <p>
                        {["capturing", "processing"].includes(c.status)
                          ? "Collecting or processing satellite data. Decoded imagery will appear here."
                          : "This session did not produce an image. Check the pass, antenna, frequency, and symbol rate."}
                      </p>
                    )}
                  </article>
                ))
              ) : (
                <Empty icon={Satellite} title="Your first picture from space">
                  Decoded captures will appear here. No sample imagery—only what your antenna
                  receives.
                </Empty>
              )}
            </section>
          </div>
        </TabsContent>
        <TabsContent value="sensors">
          <div className="page-heading">
            <div>
              <p className="eyebrow">THE SIGNALS AROUND YOU</p>
              <h1>Small signals. Real life.</h1>
            </div>
            <Wifi className="heading-icon" />
          </div>
          <section className="sensor-intro">
            <div>
              <h2>
                {data.receiver.mode === "sensors"
                  ? `Listening on ${data.receiver.options.frequency} MHz`
                  : "Discover your wireless sensors"}
              </h2>
              <p>
                Weather stations, thermometers, soil probes, and supported tire-pressure sensors.
              </p>
            </div>
            <Button
              onClick={() => choose(data.receiver.mode === "sensors" ? "aircraft" : "sensors")}
            >
              {data.receiver.mode === "sensors" ? "Return to aircraft" : "Start listening"}
            </Button>
          </section>
          {data.sensors.length ? (
            <div className="sensor-grid">
              {data.sensors.map((s) => (
                <SensorCard sensor={s} key={s.id} />
              ))}
            </div>
          ) : (
            <section className="panel">
              <Empty icon={Thermometer} title="Waiting for your first sensor">
                Choose the band used by your sensors. Some devices transmit only every few minutes
                or when a reading changes.
              </Empty>
            </section>
          )}
          <p className="supporting">
            Saved readings remain visible when you switch modes. Compatibility depends on the sensor
            model.{" "}
            <a href="https://github.com/merbanan/rtl_433" target="_blank" rel="noreferrer">
              Supported devices ↗
            </a>
          </p>
        </TabsContent>
      </Tabs>
      <SiteFooter />
      <Sheet open={modeSheet} onOpenChange={setModeSheet}>
        <SheetContent side="bottom" className="control-sheet">
          <SheetTitle>Choose your wavelength</SheetTitle>
          <SheetDescription>
            One receiver, four reception modes. Replay and saved results are always available.
          </SheetDescription>
          <div className="mode-grid">
            {(["aircraft", "listen", "satellite", "sensors"] as Mode[]).map((m, i) => {
              const Icon = [Plane, Headphones, Satellite, Wifi][i];
              return (
                <button
                  key={m}
                  className={newMode === m ? "chosen" : ""}
                  onClick={() => {
                    setNewMode(m);
                    if (m === "satellite" && Number(minutes) > 20) setMinutes("15");
                  }}
                >
                  <Icon size={24} />
                  <strong>{modeNames[m]}</strong>
                  <small>{["1090 MHz", "Aircraft + weather", "137 MHz", "315–915 MHz"][i]}</small>
                </button>
              );
            })}
          </div>
          {newMode === "listen" && (
            <>
              <label className="field">
                Reception
                <select
                  value={listenBand}
                  onChange={(e) => {
                    const band = e.target.value as ListenBand;
                    setListenBand(band);
                    setFrequency(band === "weather" ? "162.550" : "126.450");
                  }}
                >
                  <option value="weather">NOAA weather · FM</option>
                  <option value="airband">Aircraft · AM</option>
                </select>
              </label>
              <label className="field">
                Frequency (MHz)
                {listenBand === "weather" ? (
                  <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                    {[
                      "162.550",
                      "162.400",
                      "162.425",
                      "162.450",
                      "162.475",
                      "162.500",
                      "162.525",
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f}
                        {f === "162.550" ? " · Tampa weather" : ""}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    inputMode="decimal"
                    type="number"
                    min="118"
                    max="136.975"
                    step=".005"
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value)}
                  />
                )}
              </label>
            </>
          )}
          {newMode === "sensors" && (
            <label className="field">
              Sensor band
              <select value={sensorBand} onChange={(e) => setSensorBand(e.target.value)}>
                {["315", "345", "433.92", "868.3", "915"].map((f) => (
                  <option key={f} value={f}>
                    {f} MHz
                  </option>
                ))}
              </select>
            </label>
          )}
          {newMode === "satellite" && (
            <>
              <div className="form-row">
                <label className="field">
                  Frequency
                  <select value={satFrequency} onChange={(e) => setSatFrequency(e.target.value)}>
                    <option value="137.1">137.1 MHz</option>
                    <option value="137.9">137.9 MHz</option>
                  </select>
                </label>
                <label className="field">
                  Symbol rate
                  <select value={satRate} onChange={(e) => setSatRate(e.target.value)}>
                    <option value="72">72k</option>
                    <option value="80">80k</option>
                  </select>
                </label>
              </div>
              <p className="supporting">
                Check the satellite’s current transmission settings before capturing. Use an antenna
                suited to 137 MHz.
              </p>
            </>
          )}
          {newMode !== "aircraft" && (
            <label className="field">
              Return to aircraft after
              <select value={minutes} onChange={(e) => setMinutes(e.target.value)}>
                {(newMode === "satellite" ? ["5", "10", "15", "20"] : ["5", "15", "30", "60"]).map(
                  (n) => (
                    <option value={n} key={n}>
                      {n} minutes
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          <Button disabled={busy || data.receiver.switching} onClick={switchMode}>
            {busy ? "Switching receiver…" : `Start ${modeNames[newMode].toLowerCase()}`}
            <ChevronRight size={18} />
          </Button>
        </SheetContent>
      </Sheet>
      <Sheet open={station} onOpenChange={setStation}>
        <SheetContent side="bottom" className="control-sheet station-sheet">
          <SheetTitle>Your station</SheetTitle>
          <SheetDescription>Nooelec NESDR SMArt v5 · Hosted on your Mac</SheetDescription>
          <div className="account-box">
            <div>
              <h3>Signed in as {data.username}</h3>
              <p>Full access to every reception mode.</p>
            </div>
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() =>
                action(async () => {
                  await post("logout", {});
                  onSignedOut();
                })
              }
            >
              Sign out
            </Button>
          </div>
          {draft && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  await post("settings", draft);
                  flash("Station settings saved.");
                });
              }}
            >
              <h3>Receiver location & alerts</h3>
              <p className="supporting">
                Use the antenna’s location for distances, alerts, and satellite passes.
              </p>
              <label className="field">
                Station name
                <input
                  disabled={!controls}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </label>
              <div className="form-row">
                <label className="field">
                  Latitude
                  <input
                    disabled={!controls}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={draft.latitude ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        latitude: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
                <label className="field">
                  Longitude
                  <input
                    disabled={!controls}
                    type="number"
                    step="any"
                    inputMode="decimal"
                    value={draft.longitude ?? ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        longitude: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </label>
              </div>
              <label className="field">
                Overhead alert radius (nautical miles)
                <input
                  disabled={!controls}
                  type="number"
                  step=".5"
                  min=".5"
                  max="100"
                  value={draft.alert_nm}
                  onChange={(e) => setDraft({ ...draft, alert_nm: Number(e.target.value) })}
                />
              </label>
              {controls && (
                <Button disabled={busy} type="submit">
                  Save station
                </Button>
              )}
            </form>
          )}
          <PushAlerts canControl={controls} />
          <div className="station-tools">
            <h3>Receiver tools</h3>
            {Object.entries(data.tools).map(([name, ok]) => (
              <div key={name}>
                <span>{name}</span>
                <span className={ok ? "good" : ""}>{ok ? "Ready" : "Not installed"}</span>
              </div>
            ))}
          </div>
          <p className="supporting">
            Keep your Mac awake and online. Add Skyglow to your iPhone Home Screen from Safari’s
            Share menu. Aircraft history is kept for 7 days; captures for 30 days.
          </p>
          {controls && (
            <>
              <Button
                variant="secondary"
                onClick={() =>
                  action(async () => {
                    const r = await fetch("/api/receiver-log");
                    const d = (await r.json()) as { text?: string; error?: string };
                    setLog(d.text || d.error || "No log available.");
                  })
                }
              >
                View receiver log
              </Button>
              {log && <pre className="receiver-log">{log}</pre>}
            </>
          )}
        </SheetContent>
      </Sheet>
      <Sheet
        open={!!selected}
        onOpenChange={(v) => {
          if (!v) setSelected(null);
        }}
      >
        <SheetContent side="bottom" className="control-sheet">
          {selected && (
            <>
              <SheetTitle>{selected.flight || selected.hex.toUpperCase()}</SheetTitle>
              <SheetDescription>Aircraft broadcast · {selected.hex.toUpperCase()}</SheetDescription>
              <div className="detail-grid">
                <Stat
                  label="Altitude"
                  value={
                    typeof selected.alt === "number"
                      ? number(selected.alt)
                      : selected.alt === "ground"
                        ? "Ground"
                        : "—"
                  }
                  unit={typeof selected.alt === "number" ? "ft" : undefined}
                />
                <Stat label="Speed" value={number(selected.speed)} unit="kt" />
                <Stat label="Distance" value={number(selected.distance, 1)} unit="nm" />
                <Stat label="Direction" value={number(selected.track)} unit="°" />
              </div>
              {selected.lat != null && (
                <p className="supporting">
                  {selected.lat.toFixed(4)}, {selected.lon?.toFixed(4)} · bearing{" "}
                  {selected.bearing ?? "—"}° from your receiver
                </p>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
      {notice && (
        <div className="toast" role="status">
          <Signal size={18} />
          <span>{notice}</span>
          <button aria-label="Dismiss message" onClick={() => setNotice("")}>
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}

function Replay({ data, onSelect }: { data: Snapshot; onSelect: (a: Aircraft) => void }) {
  const [date, setDate] = useState(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }),
    [points, setPoints] = useState<Position[]>([]),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState("300"),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [reload, setReload] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setPlaying(false);
    setError("");
    const start = new Date(date + "T00:00:00").getTime() / 1000,
      end = new Date(date + "T23:59:59").getTime() / 1000 + 1;
    fetch(`/api/replay?start=${start}&end=${end}`, { signal: ac.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Archive could not load.");
        return r.json();
      })
      .then((raw) => {
        const d = raw as { points: Position[]; truncated: boolean };
        setPoints(d.points);
        setCursor(d.points[0]?.[0] ?? start);
        if (d.truncated) setError("Showing the first 60,000 archived positions.");
      })
      .catch((e) => {
        if (e.name !== "AbortError") {
          setPoints([]);
          setError(e.message);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
  }, [date, reload]);
  const first = points[0]?.[0] ?? 0,
    last = points.at(-1)?.[0] ?? first;
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setCursor((c) => {
          const next = c + Number(speed) / 5;
          if (next >= last) {
            setPlaying(false);
            return last;
          }
          return next;
        }),
      200,
    );
    return () => clearInterval(timer);
  }, [playing, speed, last]);
  const { aircraft, tracks } = useMemo(() => {
    const latest = new Map<string, Position>();
    const tracks: Position[] = [];
    for (const p of points) {
      if (p[0] > cursor) break;
      latest.set(p[1], p);
      if (p[0] > cursor - 600) tracks.push(p);
    }
    const aircraft: Aircraft[] = [...latest.values()]
      .filter((p) => cursor - p[0] < 90)
      .map((p) => ({
        hex: p[1],
        flight: p[2],
        lat: p[3],
        lon: p[4],
        alt: p[5],
        speed: p[6],
        track: p[7],
        distance: p[8],
        bearing: null,
      }));
    return { aircraft, tracks };
  }, [points, cursor]);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR SKY, SAVED</p>
          <h1>Watch it again.</h1>
        </div>
        <History className="heading-icon" />
      </div>
      <div className="replay-date">
        <label className="field">
          Flight archive
          <input
            aria-label="Replay date"
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        <Button variant="secondary" onClick={() => setReload((x) => x + 1)}>
          Refresh
        </Button>
      </div>
      <SkyMap aircraft={aircraft} tracks={tracks} settings={data.settings} onSelect={onSelect} />
      <section className="replay-controls">
        <div className="playback-heading">
          <div>
            <span className="eyebrow">{loading ? "LOADING ARCHIVE" : "LOCAL TIME"}</span>
            <h2>{points.length ? clock(cursor) : "No recordings"}</h2>
          </div>
          <label className="speed-label">
            Speed
            <select value={speed} onChange={(e) => setSpeed(e.target.value)}>
              {["30", "60", "300", "600"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
            <span>×</span>
          </label>
          <Button
            aria-label={playing ? "Pause replay" : "Play replay"}
            disabled={!points.length}
            onClick={() => {
              if (cursor >= last) setCursor(first);
              setPlaying(!playing);
            }}
          >
            {playing ? <Pause /> : <Play />}
          </Button>
        </div>
        <input
          aria-label="Replay time"
          type="range"
          min={first}
          max={Math.max(first + 1, last)}
          step="1"
          value={cursor}
          disabled={!points.length}
          onChange={(e) => {
            setPlaying(false);
            setCursor(Number(e.target.value));
          }}
        />
        <div className="timeline-labels">
          <span>{points.length ? clock(first) : "—"}</span>
          <span>{points.length ? clock(last) : "—"}</span>
        </div>
      </section>
      {error && (
        <p role="alert" className="banner">
          {error}
        </p>
      )}
      {!points.length && !loading && (
        <Empty icon={History} title="A fresh page in your flight log">
          Recording begins when Skyglow is running in aircraft mode. Choose a day with saved
          positions, or return after a few minutes.
        </Empty>
      )}
      <div className="stats-strip">
        <Stat label="Archived positions" value={number(points.length)} />
        <Stat label="Aircraft" value={number(new Set(points.map((p) => p[1])).size)} />
        <Stat label="Trail length" value="10" unit="min" />
      </div>
      <p className="supporting">
        Replay uses one-minute samples and shows gaps when the receiver was on another band. Your
        Mac saves new positions every 10 seconds while aircraft reception is active.
      </p>
    </>
  );
}

function SensorCard({ sensor: s }: { sensor: Sensor }) {
  const [history, setHistory] = useState<{ t: number; data: Reading }[] | null>(null),
    [error, setError] = useState("");
  const fields = Object.entries(s.data).filter(
    ([k, v]) =>
      !["model", "id", "time", "mic", "protocol", "channel"].includes(k) &&
      ["number", "boolean"].includes(typeof v),
  );
  return (
    <section className="panel sensor-card">
      <div className="section-heading">
        <h2>
          <Thermometer size={18} />
          {s.model.replaceAll("-", " ")}
        </h2>
      </div>
      <p className="sensor-id">
        {s.id.split(":").at(-1)} · {ago(s.last)}
      </p>
      <div className="sensor-values">
        {fields.slice(0, 8).map(([k, v]) => (
          <div key={k}>
            <span>{k.replaceAll("_", " ")}</span>
            <strong>{typeof v === "number" ? number(v, 2) : String(v)}</strong>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        onClick={async () => {
          if (history) {
            setHistory(null);
            return;
          }
          try {
            const r = await fetch("/api/sensor-history?id=" + encodeURIComponent(s.id));
            if (!r.ok) throw new Error("Readings unavailable.");
            const d = (await r.json()) as { readings: { t: number; data: Reading }[] };
            setHistory(d.readings);
          } catch (e) {
            setError(String(e));
          }
        }}
      >
        {history ? "Hide readings" : "Recent readings"}
        <ChevronRight size={15} />
      </Button>
      {error && <p role="alert">{error}</p>}
      {history && (
        <div className="readings">
          {history.slice(0, 12).map((r, i) => (
            <div key={r.t + "-" + i}>
              <time>{clock(r.t)}</time>
              <span>
                {fields
                  .slice(0, 3)
                  .map(([k]) => `${k.replaceAll("_", " ")}: ${r.data[k] ?? "—"}`)
                  .join(" · ")}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
