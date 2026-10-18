import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API = import.meta.env.VITE_API || "/api";
const call = (p, o) => fetch(API + p, o).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d; });
const post = (p, b) => call(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const ugx = n => "UGX " + Number(n).toLocaleString();
const AMENITIES = ["Water", "Wi-Fi", "Security guard", "Backup power"];
const PARTS = [["price", "Price"], ["distance", "Distance"], ["safety", "Safety"], ["reviews", "Reviews"]];

function Stars({ v, set }) {
  return <span className="stars">{[1, 2, 3, 4, 5].map(n => <button type="button" key={n} disabled={!set} className={n <= Math.round(v) ? "on" : ""} onClick={() => set(n)} aria-label={`${n} stars`}>★</button>)}</span>;
}

function Breakdown({ s }) {
  return <div className="bd">{PARTS.map(([k, l]) => <div key={k} title={`${l}: ${s[k]}/100`}><span>{l}</span><i><b style={{ width: s[k] + "%" }} /></i></div>)}</div>;
}

function PinPicker({ pos, onPick, center }) {
  const Click = () => { useMapEvents({ click: e => onPick([e.latlng.lat, e.latlng.lng]) }); return null; };
  return <MapContainer center={center} zoom={14} className="map small"><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" /><Click />{pos && <CircleMarker center={pos} radius={10} pathOptions={{ color: "#E4572E" }} />}</MapContainer>;
}

function Detail({ id, onClose }) {
  const [h, setH] = useState(null); const [f, setF] = useState({ rating: 4, safety: 4, comment: "" }); const [err, setErr] = useState("");
  const load = () => call(`/hostels/${id}`).then(setH).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  const send = async e => { e.preventDefault(); try { await post(`/hostels/${id}/reviews`, f); setF({ rating: 4, safety: 4, comment: "" }); load(); } catch (x) { setErr(x.message); } };
  return <div className="overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Hostel details">
    <button className="x" onClick={onClose} aria-label="Close">×</button>
    {!h ? <p>{err || "Loading…"}</p> : <>
      <h2>{h.name}</h2><p className="muted">{h.room} room · {ugx(h.price)} per month</p>
      <p>{h.description || "No description yet."}</p>
      <p className="tags">{h.amenities.map(a => <span key={a}>{a}</span>)}</p>
      {h.phone && <a className="btn" href={`https://wa.me/${h.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Message on WhatsApp</a>}
      <h3>Reviews ({h.reviews.length})</h3>
      {h.reviews.length === 0 && <p className="muted">No reviews yet. Be the first to share what it is like to live here.</p>}
      {h.reviews.map((r, i) => <div className="rev" key={i}><Stars v={r.rating} /> <small>Safety {r.safety}/5</small><p>{r.comment}</p></div>)}
      <form onSubmit={send} className="rform"><label>Overall <Stars v={f.rating} set={n => setF({ ...f, rating: n })} /></label>
        <label>Safety <Stars v={f.safety} set={n => setF({ ...f, safety: n })} /></label>
        <input placeholder="Say something useful for the next student" value={f.comment} onChange={e => setF({ ...f, comment: e.target.value })} maxLength={300} />
        <button className="btn">Post review</button>{err && <p className="err">{err}</p>}</form></>}
  </div></div>;
}

function Compare({ items, onRemove, onClose }) {
  const best = (fn, hi) => { const v = items.map(fn); return hi ? Math.max(...v) : Math.min(...v); };
  const rows = [["Price per month", h => ugx(h.price), h => h.price === best(x => x.price)], ["Distance", h => h.distance_km + " km", h => h.distance_km === best(x => x.distance_km)],
    ["Safety", h => h.safety_score.toFixed(1) + " / 5", h => h.safety_score === best(x => x.safety_score, 1)], ["Rating", h => h.avg_rating ? h.avg_rating.toFixed(1) + " / 5" : "No reviews", h => h.avg_rating === best(x => x.avg_rating, 1)],
    ["Room", h => h.room], ["Amenities", h => h.amenities.join(", ") || "None listed"], ["Match score", h => h.score.total + " / 100", h => h.score.total === best(x => x.score.total, 1)]];
  return <div className="overlay" onClick={onClose}><div className="modal wide" onClick={e => e.stopPropagation()}><button className="x" onClick={onClose} aria-label="Close">×</button>
    <h2>Compare hostels</h2><div className="scroll"><table><thead><tr><th />{items.map(h => <th key={h.id}>{h.name}<br /><button className="link" onClick={() => onRemove(h.id)}>Remove</button></th>)}</tr></thead>
      <tbody>{rows.map(([l, f, b]) => <tr key={l}><th>{l}</th>{items.map(h => <td key={h.id} className={b && b(h) ? "best" : ""}>{f(h)}</td>)}</tr>)}</tbody></table></div>
    <p className="muted">Highlighted cells show the best value in each row.</p></div></div>;
}

function ListRoom({ campus, done }) {
  const [f, setF] = useState({ name: "", price: "", room: "Shared", phone: "", description: "", amenities: [] }); const [pos, setPos] = useState(null); const [err, setErr] = useState("");
  const tog = a => setF({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] });
  const send = async e => { e.preventDefault(); if (!pos) return setErr("Click the map to place your hostel."); try { await post("/hostels", { ...f, price: +f.price, lat: pos[0], lng: pos[1] }); done(); } catch (x) { setErr(x.message); } };
  return <form className="panel form" onSubmit={send}><h2>List a room</h2>
    <label>Hostel name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Price per month (UGX)<input required type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
    <label>Room type<select value={f.room} onChange={e => setF({ ...f, room: e.target.value })}><option>Shared</option><option>Single</option><option>Self-contained</option></select></label>
    <label>WhatsApp number (with country code)<input value={f.phone} placeholder="2567…" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
    <fieldset><legend>Amenities</legend>{AMENITIES.map(a => <label key={a} className="chk"><input type="checkbox" checked={f.amenities.includes(a)} onChange={() => tog(a)} />{a}</label>)}</fieldset>
    <label>Description<textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
    <p className="muted">Click the map to place your hostel.</p><PinPicker pos={pos} onPick={setPos} center={[campus.lat, campus.lng]} />
    {err && <p className="err">{err}</p>}<button className="btn">Publish listing</button></form>;
}

function AddCampus({ done }) {
  const [f, setF] = useState({ name: "", city: "" }); const [pos, setPos] = useState(null); const [err, setErr] = useState("");
  const send = async e => { e.preventDefault(); if (!pos) return setErr("Click the map to place the campus."); try { const r = await post("/campuses", { ...f, lat: pos[0], lng: pos[1] }); done(r.id); } catch (x) { setErr(x.message); } };
  return <form className="panel form" onSubmit={send}><h2>Add your campus</h2>
    <label>University name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Town or city<input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></label>
    <p className="muted">Click the map to place the main gate.</p><PinPicker pos={pos} onPick={setPos} center={[1.3733, 32.2903]} />
    {err && <p className="err">{err}</p>}<button className="btn">Add campus</button></form>;
}


const tilt = e => { const el = e.currentTarget, r = el.getBoundingClientRect(); el.style.setProperty("--ry", ((e.clientX - r.left) / r.width - .5) * 9 + "deg"); el.style.setProperty("--rx", -((e.clientY - r.top) / r.height - .5) * 9 + "deg"); };
const untilt = e => { e.currentTarget.style.setProperty("--rx", "0deg"); e.currentTarget.style.setProperty("--ry", "0deg"); };

function Tower({ floors, x, z, hue }) {
  return <div className="tower" style={{ height: floors * 38, "--x": x + "px", "--z": z + "px", "--h": hue }}>
    {Array.from({ length: floors }, (_, i) => <div className="floor" key={i} style={{ top: i * 38 }}>{["fr", "bk", "lf", "rt"].map(f => <div key={f} className={"f " + f} />)}</div>)}
    <div className="roof" />
  </div>;
}

function Hero({ campus }) {
  return <section className="hero"><div className="scene" aria-hidden="true"><div className="city">
    <div className="ground" /><Tower floors={4} x={-80} z={-20} hue={200} /><Tower floors={6} x={20} z={30} hue={215} /><Tower floors={3} x={110} z={-30} hue={175} /></div></div>
    <div className="copy"><h1>A room you can afford, close to {campus.name}</h1><p>CampusNest ranks every hostel by price, distance, safety and student reviews, so you can pick with confidence.</p></div></section>;
}

export default function App() {
  const [campuses, setCampuses] = useState([]); const [cid, setCid] = useState(null); const [view, setView] = useState("find");
  const [q, setQ] = useState({ budget: "", max_km: 5, room: "", sort: "match" }); const [list, setList] = useState([]); const [err, setErr] = useState("");
  const [open, setOpen] = useState(null); const [picked, setPicked] = useState([]); const [cmp, setCmp] = useState(false);
  const loadCampuses = sel => call("/campuses").then(c => { setCampuses(c); setCid(sel || cid || c[0]?.id); }).catch(e => setErr("Cannot reach the server. " + e.message));
  const campus = campuses.find(c => c.id === cid);
  const loadList = () => { if (!cid) return; const p = new URLSearchParams({ campus_id: cid, max_km: q.max_km, sort: q.sort }); if (q.budget) p.set("budget", q.budget); if (q.room) p.set("room", q.room); call("/hostels?" + p).then(setList).catch(e => setErr(e.message)); };
  useEffect(() => { loadCampuses(); }, []);
  useEffect(loadList, [cid, q, view]);
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length < 3 ? [...p, id] : p);
  const items = list.filter(h => picked.includes(h.id));
  return <>
    <header><div className="brand">CampusNest</div>
      <label className="pick">Your campus<select value={cid || ""} onChange={e => { setCid(+e.target.value); setPicked([]); }}>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}{c.city ? ", " + c.city : ""}</option>)}</select></label>
      <nav>{[["find", "Find a room"], ["list", "List a room"], ["campus", "Add a campus"]].map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</nav></header>
    {err && <p className="err bar">{err}</p>}
    {!campus ? <main><p>Loading campuses…</p></main> : view === "list" ? <main className="one"><ListRoom campus={campus} done={() => { setView("find"); setQ({ ...q, max_km: 30 }); }} /></main>
      : view === "campus" ? <main className="one"><AddCampus done={id => { loadCampuses(id); setView("find"); }} /></main> :
      <main>
        <Hero campus={campus} />
        <section>
          <h2>Rooms near {campus.name}</h2>
          <div className="filters">
            <label>Monthly budget (UGX)<input type="number" min="0" placeholder="Any" value={q.budget} onChange={e => setQ({ ...q, budget: e.target.value })} /></label>
            <label>Within {q.max_km} km<input type="range" min="1" max="30" value={q.max_km} onChange={e => setQ({ ...q, max_km: e.target.value })} /></label>
            <label>Room type<select value={q.room} onChange={e => setQ({ ...q, room: e.target.value })}><option value="">Any</option><option>Shared</option><option>Single</option><option>Self-contained</option></select></label>
            <label>Sort by<select value={q.sort} onChange={e => setQ({ ...q, sort: e.target.value })}><option value="match">Best match</option><option value="price">Lowest price</option><option value="distance">Closest</option></select></label>
          </div>
          <p className="muted">Match score = price 30%, distance 30%, safety 25%, reviews 15%, compared with the other rooms in your results.</p>
          {list.length === 0 && <p className="empty">No rooms match. Raise your budget or widen the distance.</p>}
          {list.map(h => <article className="card" key={h.id} onMouseMove={tilt} onMouseLeave={untilt}>
            <div className="score"><strong>{h.score.total}</strong><small>match</small></div>
            <div className="body"><h3><button className="link" onClick={() => setOpen(h.id)}>{h.name}</button></h3>
              <p>{ugx(h.price)} / month · {h.distance_km} km · {h.room}</p>
              <p className="muted">Safety {h.safety_score.toFixed(1)}/5 · {h.n_reviews} reviews</p><Breakdown s={h.score} /></div>
            <label className="cmp"><input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggle(h.id)} />Compare</label></article>)}
        </section>
        <aside><MapContainer key={campus.id} center={[campus.lat, campus.lng]} zoom={14} className="map"><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <CircleMarker center={[campus.lat, campus.lng]} radius={11} pathOptions={{ color: "#14213D", fillOpacity: .9 }}><Tooltip permanent>Campus</Tooltip></CircleMarker>
          {list.map(h => <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={8} pathOptions={{ color: "#0E9F8E", fillOpacity: .8 }} eventHandlers={{ click: () => setOpen(h.id) }}><Tooltip>{h.name} · {ugx(h.price)}</Tooltip></CircleMarker>)}</MapContainer></aside>
      </main>}
    {picked.length >= 2 && view === "find" && <div className="tray"><span>{picked.length} hostels selected</span><button className="btn" onClick={() => setCmp(true)}>Compare now</button><button className="link" onClick={() => setPicked([])}>Clear</button></div>}
    {open && <Detail id={open} onClose={() => { setOpen(null); loadList(); }} />}
    {cmp && items.length >= 2 && <Compare items={items} onRemove={id => { toggle(id); if (items.length <= 2) setCmp(false); }} onClose={() => setCmp(false)} />}
  </>;
}
