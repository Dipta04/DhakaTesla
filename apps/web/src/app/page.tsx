"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { api, DriverDashboard, FareEstimate, Ride, taka, time, User } from "@/lib/api";

const AREAS = ["Banani", "Gulshan", "Mohakhali", "Dhanmondi", "Mirpur", "Uttara", "Farmgate", "Bashundhara"];
const journey = ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED", "STARTED", "COMPLETED"];
const labels: Record<string, string> = { REQUESTED: "Waiting for a Tesla", ACCEPTED: "Seat confirmed", DRIVER_ARRIVED: "Driver arrived", STARTED: "On the way", COMPLETED: "Completed", CANCELLED: "Cancelled" };

function Icon({ name }: { name: "bolt" | "arrow" | "pin" }) {
  return name === "bolt" ? <span aria-hidden="true">ϟ</span> : name === "arrow" ? <span aria-hidden="true">→</span> : <span aria-hidden="true">●</span>;
}

function AuthPanel({ onAuth }: { onAuth: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [role, setRole] = useState<"PASSENGER" | "DRIVER">("PASSENGER");
  const [name, setName] = useState("");
  const [vehicleName, setVehicleName] = useState("");
  const [capacity, setCapacity] = useState(3);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      onAuth(await api<User>(`/auth/${mode}`, { method: "POST", body: JSON.stringify(mode === "signup" ? { name, email, password, role, ...(role === "DRIVER" ? { vehicleName, capacity } : {}) } : { email, password }) }));
    } catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  async function demo(demoEmail: string) {
    setBusy(true); setError("");
    try { onAuth(await api<User>("/auth/login", { method: "POST", body: JSON.stringify({ email: demoEmail, password: "DemoPass123!" }) })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="auth-card">
    <div className="auth-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "signup" ? "selected" : ""} onClick={() => setMode("signup")}>Create account</button></div>
    <h2>{mode === "login" ? "Welcome back" : "Let's get moving"}</h2>
    <p className="muted">{mode === "login" ? "Your next shared ride is a few taps away." : "Choose how you want to move through Dhaka."}</p>
    <form onSubmit={submit} className="stack">
      {mode === "signup" && <fieldset className="role-choice"><legend>Join as</legend><label className={role === "PASSENGER" ? "chosen" : ""}><input type="radio" name="role" value="PASSENGER" checked={role === "PASSENGER"} onChange={() => setRole("PASSENGER")} /><span><strong>Passenger</strong><small>Find and share a ride</small></span></label><label className={role === "DRIVER" ? "chosen" : ""}><input type="radio" name="role" value="DRIVER" checked={role === "DRIVER"} onChange={() => setRole("DRIVER")} /><span><strong>Driver</strong><small>Offer seats in your Tesla</small></span></label></fieldset>}
      {mode === "signup" && <label>Full name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" /></label>}
      {mode === "signup" && role === "DRIVER" && <div className="form-row"><label>Vehicle name<input required minLength={2} maxLength={80} value={vehicleName} onChange={(event) => setVehicleName(event.target.value)} placeholder="e.g. Bullet" /></label><label>Passenger seats<select value={capacity} onChange={(event) => setCapacity(Number(event.target.value))}><option value={3}>3 seats</option><option value={4}>4 seats</option><option value={5}>5 seats</option></select></label></div>}
      <label>Email address<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      <label>Password<input required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" /></label>
      {error && <p className="alert" role="alert">{error}</p>}
      <button className="button primary full" disabled={busy}>{busy ? "Just a moment…" : mode === "login" ? "Sign in" : "Create account"} <Icon name="arrow" /></button>
    </form>
    <div className="demo-box"><strong>Try the live demo</strong><p>Explore both sides of the Banani rush hour.</p><div className="demo-actions"><button disabled={busy} onClick={() => demo("nusrat@teslapool.test")}>Ride as Nusrat</button><button disabled={busy} onClick={() => demo("jashim@teslapool.test")}>Drive as Jashim</button></div></div>
  </div>;
}

function RideCard({ ride, onCancel, busy }: { ride: Ride; onCancel: (id: string) => void; busy: boolean }) {
  const cancelable = ["REQUESTED", "ACCEPTED", "DRIVER_ARRIVED"].includes(ride.status);
  const activeStep = journey.indexOf(ride.status);
  return <article className="ride-card">
    <div className="ride-top"><span className={`status ${ride.status.toLowerCase()}`}>{labels[ride.status]}</span><span className="ride-date">{time(ride.createdAt)}</span></div>
    <div className="route"><div><small>FROM</small><strong>{ride.pickup}</strong></div><span className="route-line"><Icon name="arrow" /></span><div><small>TO</small><strong>{ride.destination}</strong></div></div>
    <div className="ride-facts"><span>{ride.seats} {ride.seats === 1 ? "seat" : "seats"}</span><span>{ride.membership?.pool.vehicle.name || "Finding a Tesla"}</span><span>{ride.payment === "TESLAPAY" ? "TeslaPay (demo)" : "Cash"}</span><strong>{taka(ride.farePaisa)}</strong></div>
    <div className="fare-lines ride-fare-lines"><span>Base fare · {ride.seats} {ride.seats === 1 ? "seat" : "seats"}<strong>{taka(ride.baseFarePaisa)}</strong></span><span>Distance charge<strong>+ {taka(ride.distanceChargePaisa)}</strong></span><span className="discount-line">Pool discount<strong>− {taka(ride.poolDiscountPaisa)}</strong></span><span className="fare-total">{ride.status === "CANCELLED" ? "Recorded fare before cancellation" : "Your current fare"}<strong>{taka(ride.farePaisa)}</strong></span></div>
    {ride.status !== "CANCELLED" && <div className="progress" aria-label={`Ride status: ${labels[ride.status]}`}>{journey.map((step, index) => <span key={step} className={index <= activeStep ? "done" : ""} title={labels[step]} />)}</div>}
    {ride.events && <details className="history"><summary>View ride timeline</summary><ol>{ride.events.map((event, index) => <li key={index}><strong>{labels[event.to]}</strong><span>{time(event.createdAt)}</span>{event.note && <small>{event.note}</small>}</li>)}</ol></details>}
    {cancelable && <button className="text-button danger" disabled={busy} onClick={() => onCancel(ride.id)}>Cancel this ride</button>}
  </article>;
}

function PassengerPanel({ user }: { user: User }) {
  const [pickup, setPickup] = useState("Banani");
  const [destination, setDestination] = useState("Mohakhali");
  const [seats, setSeats] = useState(1);
  const [payment, setPayment] = useState("CASH");
  const [estimate, setEstimate] = useState<FareEstimate | null>(null);
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try { setRides(await api<Ride[]>("/requests")); setError(""); }
    catch (err) { setError((err as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10000); return () => clearInterval(timer); }, [refresh]);
  useEffect(() => {
    if (pickup === destination) { setEstimate(null); return; }
    let current = true;
    api<FareEstimate>("/requests/estimate", { method: "POST", body: JSON.stringify({ pickup, destination, seats, payment }) })
      .then((value) => { if (current) setEstimate(value); }).catch(() => { if (current) setEstimate(null); });
    return () => { current = false; };
  }, [pickup, destination, seats, payment]);

  async function book(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { await api("/requests", { method: "POST", body: JSON.stringify({ pickup, destination, seats, payment }) }); setNotice("Request sent. Jashim can now match your seat."); await refresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  async function cancel(id: string) {
    setBusy(true); setError(""); setNotice("");
    try { await api(`/requests/${id}/cancel`, { method: "POST" }); setNotice("Ride cancelled."); await refresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return <main className="dashboard container">
    <div className="page-title"><div><span className="eyebrow">PASSENGER DASHBOARD</span><h1>Good to see you, {user.name.split(" ")[0]}.</h1><p>Where are you headed today?</p></div><span className="city-chip">● Live in Dhaka</span></div>
    <div className="dashboard-grid"><section className="booking-card"><div className="section-heading"><div><span className="eyebrow">PLAN A RIDE</span><h2>Find your seat</h2></div><span className="card-icon">✦</span></div>
      <form onSubmit={book} className="stack"><div className="form-row"><label>Pick-up area<select value={pickup} onChange={(event) => setPickup(event.target.value)}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></label><label>Destination<select value={destination} onChange={(event) => setDestination(event.target.value)}>{AREAS.map((area) => <option key={area}>{area}</option>)}</select></label></div>
        <div className="form-row"><label>Seats<select value={seats} onChange={(event) => setSeats(Number(event.target.value))}>{[1,2,3,4,5].map((count) => <option key={count} value={count}>{count} {count === 1 ? "seat" : "seats"}</option>)}</select></label><label>Payment<select value={payment} onChange={(event) => setPayment(event.target.value)}><option value="CASH">Cash</option><option value="TESLAPAY">TeslaPay (simulated)</option></select></label></div>
        <div className="fare-preview"><div><small>ESTIMATE BEFORE MATCHING · {seats} {seats === 1 ? "SEAT" : "SEATS"}</small><strong>{pickup === destination ? "Choose a destination" : estimate ? taka(estimate.solo.farePaisa) : "Calculating…"}</strong></div><div className="discount-tag">If pooled: {estimate ? taka(estimate.pooled.farePaisa) : "—"}</div></div>
        {estimate && <div className="fare-lines"><span>Base fare<strong>{taka(estimate.solo.baseFarePaisa)}</strong></span><span>Distance · {estimate.solo.distanceKm} km<strong>+ {taka(estimate.solo.distanceChargePaisa)}</strong></span><span className="discount-line">Potential pool discount · 20%<strong>− {taka(estimate.pooled.poolDiscountPaisa)}</strong></span><span className="fare-total">After pool discount<strong>{taka(estimate.pooled.farePaisa)}</strong></span></div>}
        <p className="hint">You start at the solo fare. The discount is applied to your booking when a second compatible booking joins before departure.</p>
        <button className="button primary full" disabled={busy || pickup === destination}>{busy ? "Sending request…" : "Request a Tesla"} <Icon name="arrow" /></button>
      </form></section>
      <aside className="how-card"><span className="eyebrow">HOW IT WORKS</span><h2>Better together.<br />Even in traffic.</h2><div className="how-step"><span>01</span><div><strong>Pick your route</strong><p>Choose from familiar Dhaka neighbourhoods.</p></div></div><div className="how-step"><span>02</span><div><strong>Share when it fits</strong><p>Compatible trips can use a driver's available seats.</p></div></div><div className="how-step"><span>03</span><div><strong>Pay your own fare</strong><p>Everyone sees their own price and progress.</p></div></div><div className="mini-map"><div className="map-path" /><span className="map-dot first">Banani</span><span className="map-dot second">Mohakhali</span><span className="map-dot third">Gulshan</span></div></aside></div>
    {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <section className="rides-section"><div className="list-title"><div><span className="eyebrow">YOUR JOURNEYS</span><h2>Rides & history</h2></div><button className="text-button" onClick={() => void refresh()}>Refresh status ↻</button></div>{loading ? <div className="empty">Loading your rides…</div> : rides.length ? <div className="ride-list">{rides.map((ride) => <RideCard key={ride.id} ride={ride} busy={busy} onCancel={cancel} />)}</div> : <div className="empty"><strong>No rides yet</strong><p>Your first request will appear here.</p></div>}</section>
  </main>;
}

function DriverPanel({ user }: { user: User }) {
  const [data, setData] = useState<DriverDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => { try { setData(await api<DriverDashboard>("/driver/dashboard")); setError(""); } catch (err) { setError((err as Error).message); } finally { setLoading(false); } }, []);
  useEffect(() => { void refresh(); const timer = setInterval(() => void refresh(), 10000); return () => clearInterval(timer); }, [refresh]);
  async function action(path: string, body?: object) {
    setBusy(true); setError(""); setNotice("");
    try { await api(path, { method: path.endsWith("/online") ? "PATCH" : "POST", body: body ? JSON.stringify(body) : undefined }); setNotice("Trip updated."); await refresh(); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }
  const active = data?.pools.find((pool) => ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"].includes(pool.status));
  const occupied = active?.memberships.filter(({ request }) => request.status !== "CANCELLED").reduce((sum, member) => sum + member.seats, 0) || 0;
  const next = active?.status === "ACCEPTED" ? "DRIVER_ARRIVED" : active?.status === "DRIVER_ARRIVED" ? "STARTED" : active?.status === "STARTED" ? "COMPLETED" : null;
  return <main className="dashboard container"><div className="page-title"><div><span className="eyebrow">DRIVER DASHBOARD</span><h1>Ready when you are, {user.name}.</h1><p>Keep your Tesla moving, one shared trip at a time.</p></div><span className="city-chip">● Dhaka dispatch</span></div>
    {error && <p className="alert" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {loading ? <div className="empty">Loading your dashboard…</div> : data && <><section className="driver-summary"><div className="vehicle-illustration"><span>⚡</span></div><div><span className="eyebrow">YOUR TESLA</span><h2>{data.vehicle.name}</h2><p>{data.vehicle.capacity} passenger seats, countless shortcuts through the city.</p></div><div className="vehicle-stats"><strong>{occupied}<span>/{data.vehicle.capacity}</span></strong><small>SEATS OCCUPIED</small></div><button className={`button ${data.vehicle.isOnline ? "outline" : "primary"}`} disabled={busy} onClick={() => action("/driver/online", { online: !data.vehicle.isOnline })}>{data.vehicle.isOnline ? "Go offline" : "Go online"}</button></section>
      <div className="driver-grid"><section className="panel"><div className="list-title"><div><span className="eyebrow">CURRENT JOURNEY</span><h2>{active ? "Your active pool" : "No active pool"}</h2></div>{active && <span className={`status ${active.status.toLowerCase()}`}>{labels[active.status]}</span>}</div>
        {active ? <><p className="muted">Pick-up in {active.pickup} · {occupied} of {data.vehicle.capacity} seats filled</p><div className="member-list">{active.memberships.filter(({ request }) => request.status !== "CANCELLED").map(({ request }) => <div className="member" key={request.id}><div className="avatar">{request.passenger.name.slice(0,1)}</div><div><strong>{request.passenger.name}</strong><small>{request.pickup} → {request.destination} · {request.seats} {request.seats === 1 ? "seat" : "seats"}</small></div><strong>{taka(request.farePaisa)}</strong></div>)}</div><div className="pool-actions">{next && <button className="button primary" disabled={busy} onClick={() => action(`/driver/pools/${active.id}/advance`, { next })}>{next === "DRIVER_ARRIVED" ? "Mark arrived" : next === "STARTED" ? "Start ride" : "Complete ride"} →</button>}{["ACCEPTED", "DRIVER_ARRIVED"].includes(active.status) && <button className="button outline danger" disabled={busy} onClick={() => action(`/driver/pools/${active.id}/cancel`)}>Cancel pool</button>}</div></> : <div className="empty compact"><strong>Your next pool starts here</strong><p>Accept a request to assign Bullet.</p></div>}</section>
        <section className="panel"><div className="list-title"><div><span className="eyebrow">NEW REQUESTS</span><h2>Passengers waiting</h2></div><span className="count">{data.pending.length}</span></div>{data.pending.length ? <div className="request-list">{data.pending.map((request) => <div className="request-row" key={request.id}><div><strong>{request.passenger.name}</strong><small>{request.pickup} → {request.destination} · {request.seats} {request.seats === 1 ? "seat" : "seats"}</small><span>{taka(request.farePaisa)} before pooling</span></div><button className="button small" disabled={busy || !data.vehicle.isOnline || !!active && active.status !== "ACCEPTED"} onClick={() => action(`/driver/requests/${request.id}/accept`)}>Accept</button></div>)}</div> : <div className="empty compact"><strong>All caught up</strong><p>New passenger requests will show here.</p></div>}</section></div>
      <section className="rides-section"><div className="list-title"><div><span className="eyebrow">PREVIOUS TRIPS</span><h2>Pool history</h2></div><button className="text-button" onClick={() => void refresh()}>Refresh ↻</button></div><div className="ride-list">{data.pools.filter((pool) => !["ACCEPTED", "DRIVER_ARRIVED", "STARTED"].includes(pool.status)).map((pool) => <article className="ride-card" key={pool.id}><div className="ride-top"><span className={`status ${pool.status.toLowerCase()}`}>{labels[pool.status]}</span><span className="ride-date">{time(pool.createdAt)}</span></div><strong>{pool.pickup} departure</strong><p className="muted">{pool.memberships.map(({request}) => request.passenger.name).join(", ")}</p></article>)}</div>{data.pools.every((pool) => ["ACCEPTED", "DRIVER_ARRIVED", "STARTED"].includes(pool.status)) && <div className="empty compact">Completed and cancelled pools appear here.</div>}</section>
    </>}
  </main>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => { api<User>("/me").then(setUser).catch(() => {}).finally(() => setLoading(false)); }, []);
  async function logout() { await api("/auth/logout", { method: "POST" }).catch(() => {}); setUser(null); }
  return <><header className="site-header"><div className="container nav"><div className="brand"><span className="brand-mark"><Icon name="bolt" /></span><span>dhaka<span className="brand-accent">tesla</span><small>POOL</small></span></div><nav><a href="#how">How it works</a>{user && <span className="nav-user">{user.name}</span>}{user && <button className="text-button" onClick={logout}>Sign out</button>}</nav></div></header>
    {loading ? <main className="container"><div className="empty loading">Starting your journey…</div></main> : user ? user.role === "DRIVER" ? <DriverPanel user={user} /> : <PassengerPanel user={user} /> : <main><section className="hero container"><div className="hero-copy"><span className="eyebrow"><span className="eyebrow-line" /> DHAKA MOVES BETTER TOGETHER</span><h1>Share a seat.<br /><em>Split the fare.</em><br />Beat the traffic.</h1><p>Going the same way? Hop into a local Tesla, meet your driver, and only pay for your own ride. Built for the beautiful chaos of Dhaka.</p><div className="hero-pills"><span>✓ Fair fares</span><span>✓ Real seat counts</span><span>✓ Familiar places</span></div><div className="hero-quote">“One more seat for Mohakhali?”<small>— EVERY MORNING IN BANANI</small></div></div><AuthPanel onAuth={setUser} /></section><section className="story-strip" id="how"><div className="container strip-grid"><div><span className="eyebrow">THE MORNING RUN</span><h2>Three neighbours.<br />One Bullet.</h2></div><p>Nusrat heads to Mohakhali. Rafiq is bound for Gulshan. Jashim has three seats and a route they can share. That's the whole idea.</p><div className="strip-stat"><strong>20%</strong><span>less when a pool forms</span></div></div></section></main>}
    <footer><div className="container footer-inner"><span>ϟ dhaka tesla pool</span><span>Made for the Banani rush hour · Demo MVP</span></div></footer>
  </>;
}
