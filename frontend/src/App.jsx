import { useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMapEvents } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const API = import.meta.env.VITE_API_BASE_URL ? `${import.meta.env.VITE_API_BASE_URL}/api` : "/api";
const call = (p, o) => fetch(API + p, o).then(async r => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Something went wrong."); return d; });
const post = (p, b) => call(p, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
const img = n => "/uploads/" + n;
const postForm = (p, fd) => call(p, { method: "POST", body: fd });
const ugx = n => "UGX " + Number(n).toLocaleString();
const AMENITIES = ["Water", "Wi-Fi", "Security guard", "Electricity included", "Backup generator", "Water tank", "Shuttle route"];
const SURV = { "Electricity included": "⚡", "Backup generator": "🔌", "Water tank": "💧", "Shuttle route": "🚌" };
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

function Detail({ id, dist, low, onHub, onClose }) {
  const [h, setH] = useState(null); const [main, setMain] = useState(0); const [f, setF] = useState({ rating: 4, safety: 4, comment: "" }); const [err, setErr] = useState("");
  const load = () => call(`/hostels/${id}`).then(setH).catch(e => setErr(e.message));
  useEffect(() => { load(); }, [id]);
  const addPics = async e => { const fd = new FormData(); [...e.target.files].slice(0, 5).forEach(x => fd.append("photos", x)); try { await postForm(`/hostels/${id}/photos`, fd); load(); } catch (x) { setErr(x.message); } };
  const send = async e => { e.preventDefault(); try { await post(`/hostels/${id}/reviews`, f); setF({ rating: 4, safety: 4, comment: "" }); load(); } catch (x) { setErr(x.message); } };
  return <div className="overlay" onClick={onClose}><div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-label="Hostel details">
    <button className="x" onClick={onClose} aria-label="Close">×</button>
    {!h ? <p>{err || "Loading…"}</p> : <>
      <h2>{h.name}</h2><p className="muted">{h.room} room · {ugx(h.price)} per month</p>
      {low ? <p className="empty">Photos are hidden in low-data mode.</p> : h.photos.length ? <div className="gal"><img className="big" src={img(h.photos[Math.min(main, h.photos.length - 1)])} alt={h.name + " photo"} /><div className="row">{h.photos.map((p, i) => <img key={p} src={img(p)} alt="" className={i === main ? "on" : ""} onClick={() => setMain(i)} />)}</div></div> : <p className="empty">No photos yet.</p>}
      <label className="up">Add photos<input type="file" accept="image/*" multiple onChange={addPics} /></label>
      <p>{h.description || "No description yet."}</p>
      <p className="tags">{h.amenities.map(a => <span key={a}>{a}</span>)}</p>
      <CostCalc h={h} dist={dist} />
      <p><button className="link" onClick={() => onHub(h.id)}>Open this hostel's community hub</button></p>
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
  const [f, setF] = useState({ name: "", price: "", room: "Shared", phone: "", description: "", amenities: [], deposit: "", utilities: "" }); const [pos, setPos] = useState(null); const [err, setErr] = useState(""); const [files, setFiles] = useState([]);
  const tog = a => setF({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] });
  const send = async e => { e.preventDefault(); if (!pos) return setErr("Click the map to place your hostel."); const fd = new FormData(); Object.entries({ name: f.name, price: f.price, room: f.room, phone: f.phone, description: f.description, deposit: f.deposit, utilities: f.utilities, amenities: f.amenities.join(","), lat: pos[0], lng: pos[1] }).forEach(([k, v]) => fd.append(k, v)); files.forEach(x => fd.append("photos", x)); try { await postForm("/hostels", fd); done(); } catch (x) { setErr(x.message); } };
  return <form className="panel form" onSubmit={send}><h2>List a room</h2>
    <label>Hostel name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Price per month (UGX)<input required type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>
    <label>Deposit, paid once (UGX, optional)<input type="number" min="0" value={f.deposit} onChange={e => setF({ ...f, deposit: e.target.value })} /></label>
    <label>Utilities per month if not included (UGX, optional)<input type="number" min="0" value={f.utilities} onChange={e => setF({ ...f, utilities: e.target.value })} /></label>
    <label>Room type<select value={f.room} onChange={e => setF({ ...f, room: e.target.value })}><option>Shared</option><option>Single</option><option>Self-contained</option></select></label>
    <label>WhatsApp number (with country code)<input value={f.phone} placeholder="2567…" onChange={e => setF({ ...f, phone: e.target.value })} /></label>
    <fieldset><legend>Amenities</legend>{AMENITIES.map(a => <label key={a} className="chk"><input type="checkbox" checked={f.amenities.includes(a)} onChange={() => tog(a)} />{a}</label>)}</fieldset>
    <label>Photos of the room (up to 5)<input type="file" accept="image/*" multiple onChange={e => setFiles([...e.target.files].slice(0, 5))} /></label>
    <div>{files.map((x, i) => <img key={i} className="prev" src={URL.createObjectURL(x)} alt="" />)}</div>
    <label>Description<textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
    <p className="muted">Click the map to place your hostel.</p><PinPicker pos={pos} onPick={setPos} center={[campus.lat, campus.lng]} />
    {err && <p className="err">{err}</p>}<button className="btn">Publish listing</button></form>;
}

function AddCampus({ done }) {
  const [f, setF] = useState({ name: "", city: "" }); const [pos, setPos] = useState(null); const [err, setErr] = useState(""); const [file, setFile] = useState(null);
  const send = async e => { e.preventDefault(); if (!pos) return setErr("Click the map to place the campus."); const fd = new FormData(); fd.append("name", f.name); fd.append("city", f.city); fd.append("lat", pos[0]); fd.append("lng", pos[1]); if (file) fd.append("photo", file); try { const r = await postForm("/campuses", fd); done(r.id); } catch (x) { setErr(x.message); } };
  return <form className="panel form" onSubmit={send}><h2>Add your campus</h2>
    <label>University name<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
    <label>Town or city<input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></label>
    <label>Campus photo (optional)<input type="file" accept="image/*" onChange={e => setFile(e.target.files[0] || null)} /></label>{file && <img className="prev" src={URL.createObjectURL(file)} alt="" />}
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

function Hero({ campus, reload, low }) {
  return <section className={"hero" + (low ? " flat" : "")}>{!low && <div className="scene" aria-hidden="true"><div className="city">
    <div className="ground" /><Tower floors={4} x={-80} z={-20} hue={200} /><Tower floors={6} x={20} z={30} hue={215} /><Tower floors={3} x={110} z={-30} hue={175} /></div></div>}
    <div className="copy">{!low && (campus.photo ? <img className="campus-img" src={img(campus.photo)} alt={campus.name} /> : <label className="up">Add a photo of this campus<input type="file" accept="image/*" onChange={async e => { const fd = new FormData(); fd.append("photo", e.target.files[0]); try { await postForm(`/campuses/${campus.id}/photo`, fd); reload(); } catch { /* ignore */ } }} /></label>)}
      <h1>A room you can afford, close to {campus.name}</h1><p>CampusNest ranks every hostel by price, distance, safety and student reviews, so you can pick with confidence.</p></div></section>;
}

function Badges({ list }) {
  return <p className="badges">{list.map(a => <span key={a} className={SURV[a] ? "bdg hot" : "bdg"}>{SURV[a] ? SURV[a] + " " : ""}{a}</span>)}</p>;
}

function CostCalc({ h, dist }) {
  const [m, setM] = useState(4); const [budget, setBudget] = useState("");
  const [v, setV] = useState({ deposit: h.deposit || 0, utilities: h.utilities || 0, transport: dist < 1 ? 0 : Math.round(dist * 2 * 400 / 500) * 500, food: 8000, data: 30000 });
  const set = k => e => setV({ ...v, [k]: Math.max(0, +e.target.value || 0) });
  const rows = [["Rent", h.price * m], ["Deposit (once)", v.deposit], ["Utilities", v.utilities * m], ["Transport", v.transport * 22 * m], ["Food", v.food * 30 * m], ["Data and airtime", v.data * m]];
  const total = rows.reduce((t, r) => t + r[1], 0);
  return <details className="calc" open><summary>Semester cost calculator</summary>
    <div className="cgrid">
      <label>Months in semester: {m}<input type="range" min="3" max="6" value={m} onChange={e => setM(+e.target.value)} /></label>
      <label>Deposit, once<input type="number" value={v.deposit} onChange={set("deposit")} /></label>
      <label>Utilities per month<input type="number" value={v.utilities} onChange={set("utilities")} /></label>
      <label>Transport per campus day<input type="number" value={v.transport} onChange={set("transport")} /></label>
      <label>Food per day<input type="number" value={v.food} onChange={set("food")} /></label>
      <label>Data and airtime per month<input type="number" value={v.data} onChange={set("data")} /></label></div>
    {rows.map(([l, n]) => <div className="crow" key={l}><span>{l}</span><i><b style={{ width: total ? n / total * 100 + "%" : 0 }} /></i><em>{ugx(n)}</em></div>)}
    <p className="ctotal">Estimated total: <strong>{ugx(total)}</strong><small> (about {ugx(Math.round((total - v.deposit) / m))} per month without the deposit)</small></p>
    <label>Your semester budget (optional)<input type="number" value={budget} onChange={e => setBudget(e.target.value)} /></label>
    {budget && <p className={+budget >= total ? "ok" : "err"}>{+budget >= total ? `Within budget, with ${ugx(budget - total)} to spare.` : `Over budget by ${ugx(total - budget)}.`}</p>}
    <p className="muted">Estimates only. Utilities, transport, food and data are editable guesses, so replace them with your own numbers.</p></details>;
}

function Hub({ campus, start }) {
  const [hs, setHs] = useState([]); const [hid, setHid] = useState(start || ""); const [posts, setPosts] = useState([]); const [kind, setKind] = useState("all");
  const [f, setF] = useState({ kind: "review", title: "", body: "", price: "" }); const [err, setErr] = useState("");
  useEffect(() => { call(`/hostels?campus_id=${campus.id}&max_km=30`).then(l => { setHs(l); setHid(x => x || l[0]?.id || ""); }).catch(e => setErr(e.message)); }, [campus.id]);
  const load = () => { if (hid) call(`/hostels/${hid}/posts`).then(setPosts).catch(e => setErr(e.message)); };
  useEffect(load, [hid]);
  const send = async e => { e.preventDefault(); setErr(""); try { await post(`/hostels/${hid}/posts`, f); setF({ ...f, title: "", body: "", price: "" }); load(); } catch (x) { setErr(x.message); } };
  const shown = posts.filter(p => kind === "all" || p.kind === kind); const L = { review: "Review", warning: "Warning", sale: "For sale" };
  return <div>
    <label>Hostel hub<select value={hid} onChange={e => setHid(+e.target.value)}>{hs.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
    <div className="tabs">{[["all", "All"], ["review", "Reviews"], ["warning", "Warnings"], ["sale", "For sale"]].map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
    <form className="panel form" onSubmit={send}><h3>Post anonymously</h3>
      <label>Type<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="review">Review</option><option value="warning">Warn others about management</option><option value="sale">Sell an item (fridge, chairs…)</option></select></label>
      <label>Title<input required maxLength={80} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
      {f.kind === "sale" && <label>Price (UGX)<input type="number" min="0" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} /></label>}
      <label>Message<textarea required maxLength={500} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
      <p className="muted">No name or account is stored. Stick to facts, and do not share private details about other people.</p>
      {err && <p className="err">{err}</p>}<button className="btn">Post</button></form>
    {shown.length === 0 && <p className="empty">Nothing here yet. Be the first to post.</p>}
    {shown.map(p => <article className={"post " + p.kind} key={p.id}><small>{L[p.kind]} · Anonymous resident · {p.created.slice(0, 10)}</small><h4>{p.title}{p.price != null && <span> · {ugx(p.price)}</span>}</h4><p>{p.body}</p></article>)}
  </div>;
}

function Roommates({ campus }) {
  const [list, setList] = useState([]); const [maxB, setMaxB] = useState(""); const [err, setErr] = useState("");
  const [f, setF] = useState({ course: "", year: 1, budget: "", habits: "Flexible", note: "", phone: "" });
  const load = () => { call(`/roommates?campus_id=${campus.id}`).then(setList).catch(e => setErr(e.message)); };
  useEffect(load, [campus.id]);
  const send = async e => { e.preventDefault(); setErr(""); try { await post("/roommates", { ...f, campus_id: campus.id }); setF({ ...f, course: "", note: "" }); load(); } catch (x) { setErr(x.message); } };
  return <div>
    <form className="panel form" onSubmit={send}><h3>Looking for a roommate</h3>
      <label>Course<input required value={f.course} onChange={e => setF({ ...f, course: e.target.value })} /></label>
      <label>Year of study<select value={f.year} onChange={e => setF({ ...f, year: +e.target.value })}>{[1, 2, 3, 4, 5].map(y => <option key={y}>{y}</option>)}</select></label>
      <label>Budget per month (UGX)<input required type="number" min="0" value={f.budget} onChange={e => setF({ ...f, budget: e.target.value })} /></label>
      <label>Sleeping habits<select value={f.habits} onChange={e => setF({ ...f, habits: e.target.value })}><option>Early sleeper</option><option>Night owl</option><option>Flexible</option></select></label>
      <label>About you (optional)<input maxLength={200} value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="Quiet, studies in the library, no smoking…" /></label>
      <label>WhatsApp number (optional)<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} placeholder="2567…" /></label>
      <p className="muted">No name needed. Meet in a public place first, and never share ID numbers or money before seeing the room.</p>
      {err && <p className="err">{err}</p>}<button className="btn">Post my profile</button></form>
    <label>Show budgets up to (UGX)<input type="number" value={maxB} onChange={e => setMaxB(e.target.value)} /></label>
    <div className="rgrid">{list.filter(r => !maxB || r.budget <= +maxB).map(r => <article className="rcard" key={r.id}><h4>{r.course}</h4><p>Year {r.year} · {ugx(r.budget)} / month</p><p><span className="bdg">{r.habits}</span></p>{r.note && <p className="muted">{r.note}</p>}
      {r.phone && <a className="btn" href={`https://wa.me/${r.phone}`} target="_blank" rel="noreferrer">Message</a>}</article>)}</div>
    {list.length === 0 && <p className="empty">No profiles yet for this campus.</p>}
  </div>;
}

function Community({ campus, startHostel }) {
  const [tab, setTab] = useState("hub");
  return <div><h2>Community</h2><div className="tabs">{[["hub", "Hostel hubs"], ["mates", "Roommate board"]].map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
    {tab === "hub" ? <Hub campus={campus} start={startHostel} /> : <Roommates campus={campus} />}</div>;
}

function AddLandmark({ campus, done }) {
  const [name, setName] = useState(""); const [pos, setPos] = useState(null); const [err, setErr] = useState("");
  const send = async e => { e.preventDefault(); if (!name.trim() || !pos) return setErr("Add a name and click the map."); try { await post("/landmarks", { campus_id: campus.id, name, lat: pos[0], lng: pos[1] }); setName(""); setPos(null); setErr(""); done(); } catch (x) { setErr(x.message); } };
  return <details className="panel lm"><summary>Mark a gate or lecture hall on the map</summary><form onSubmit={send} className="form"><label>Name<input value={name} onChange={e => setName(e.target.value)} placeholder="Main Gate" /></label>
    <PinPicker pos={pos} onPick={setPos} center={[campus.lat, campus.lng]} />{err && <p className="err">{err}</p>}<button className="btn">Add to map</button></form></details>;
}

function Universities({ list, low, onOpen }) {
  const [q, setQ] = useState(""); const [t, setT] = useState("");
  const shown = list.filter(c => (!t || c.type === t) && (c.name + " " + (c.city || "")).toLowerCase().includes(q.toLowerCase()));
  return <div><h2>Universities in Uganda</h2><p className="muted">Pick a university to see its details, nearby hostels and community.</p>
    <div className="filters"><label>Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Name or town" /></label>
      <label>Type<select value={t} onChange={e => setT(e.target.value)}><option value="">All</option><option>Public</option><option>Private</option></select></label></div>
    <div className="ugrid">{shown.map(c => <button key={c.id} className="ucard" onClick={() => onOpen(c.id)}>
      {!low && c.photo && <img src={img(c.photo)} alt="" loading="lazy" />}<h3>{c.name}</h3><p className="muted">{[c.city, c.type].filter(Boolean).join(" · ")}</p>
      <p>{c.n_hostels ? `${c.n_hostels} hostels nearby · from ${ugx(c.min_price)}` : "No hostels listed yet"}</p></button>)}</div>
    {shown.length === 0 && <p className="empty">No university matches your search. Use "Add a campus" to add yours.</p>}</div>;
}

function EditUni({ u, done }) {
  const [f, setF] = useState({ type: u.type || "", city: u.city || "", website: u.website || "", about: u.about || "" }); const [pos, setPos] = useState(null); const [err, setErr] = useState("");
  const send = async e => { e.preventDefault(); try { await call(`/campuses/${u.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, ...(pos ? { lat: pos[0], lng: pos[1] } : {}) }) }); done(); } catch (x) { setErr(x.message); } };
  return <form className="form" onSubmit={send}>
    <label>Type<select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="">Not set</option><option>Public</option><option>Private</option></select></label>
    <label>Town or city<input value={f.city} onChange={e => setF({ ...f, city: e.target.value })} /></label>
    <label>Website<input value={f.website} placeholder="www.example.ac.ug" onChange={e => setF({ ...f, website: e.target.value })} /></label>
    <label>About<textarea maxLength={800} value={f.about} onChange={e => setF({ ...f, about: e.target.value })} /></label>
    <p className="muted">Optional: click the map to move the pin to the main gate.</p><PinPicker pos={pos} onPick={setPos} center={[u.lat, u.lng]} />
    {err && <p className="err">{err}</p>}<button className="btn">Save details</button></form>;
}

function UniPage({ id, low, onFind, onCommunity, reload }) {
  const [u, setU] = useState(null); const [hs, setHs] = useState([]); const [err, setErr] = useState("");
  const load = () => { call(`/campuses/${id}`).then(setU).catch(e => setErr(e.message)); call(`/hostels?campus_id=${id}&max_km=10`).then(setHs).catch(() => {}); };
  useEffect(load, [id]);
  if (!u) return <p>{err || "Loading…"}</p>;
  const stat = (l, v) => <div className="stat"><strong>{v}</strong><span>{l}</span></div>;
  return <div className="upage">
    {!low && (u.photo ? <img className="campus-img tall" src={img(u.photo)} alt={u.name} /> : <label className="up">Add a photo of this university<input type="file" accept="image/*" onChange={async e => { const fd = new FormData(); fd.append("photo", e.target.files[0]); try { await postForm(`/campuses/${id}/photo`, fd); load(); reload(); } catch (x) { setErr(x.message); } }} /></label>)}
    <h2>{u.name}</h2><p className="muted">{[u.city, u.type].filter(Boolean).join(" · ") || "Details not added yet"}</p>
    <p>{u.about || "No description yet. Add one under Edit details."}</p>
    {u.website && <p><a href={u.website} target="_blank" rel="noreferrer">Visit website</a></p>}
    <div className="stats">{stat("Hostels within 10 km", u.n_hostels)}{stat("Cheapest per month", u.min_price ? ugx(u.min_price) : "None yet")}{stat("Average per month", u.avg_price ? ugx(u.avg_price) : "None yet")}{stat("Roommate profiles", u.n_roommates)}</div>
    <p><button className="btn" onClick={onFind}>Find rooms near here</button> <button className="btn alt" onClick={onCommunity}>Open community</button></p>
    {!low && <MapContainer key={id} center={[u.lat, u.lng]} zoom={14} className="map small tall"><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
      <CircleMarker center={[u.lat, u.lng]} radius={11} pathOptions={{ color: "#14213D", fillOpacity: .9 }}><Tooltip permanent>Campus</Tooltip></CircleMarker>
      {u.landmarks.map(m => <CircleMarker key={"m" + m.id} center={[m.lat, m.lng]} radius={7} pathOptions={{ color: "#F59E0B", fillOpacity: .9 }}><Tooltip permanent>{m.name}</Tooltip></CircleMarker>)}
      {hs.map(h => <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={8} pathOptions={{ color: "#0E9F8E", fillOpacity: .8 }}><Tooltip>{h.name} · {ugx(h.price)}</Tooltip></CircleMarker>)}</MapContainer>}
    <h3>Nearby hostels</h3>
    {hs.length === 0 && <p className="empty">No hostels listed near this university yet. Landlords can add one under "List a room".</p>}
    {hs.slice(0, 5).map(h => <div className="mini" key={h.id}><strong>{h.name}</strong> · {ugx(h.price)} per month · {h.distance_km} km<Badges list={h.amenities} /></div>)}
    {u.landmarks.length > 0 && <><h3>Gates and lecture halls</h3><p>{u.landmarks.map(m => <span className="bdg" key={m.id}>{m.name}</span>)}</p></>}
    <details className="panel lm"><summary>Edit details</summary><EditUni u={u} done={() => { load(); reload(); }} /></details>
    <p className="muted">University map pins are approximate. Use Edit details to move the pin to the main gate.</p>
  </div>;
}

function Skyline() {
  return <div className="scene" aria-hidden="true"><div className="city"><div className="ground" /><Tower floors={4} x={-80} z={-20} hue={200} /><Tower floors={6} x={20} z={30} hue={215} /><Tower floors={3} x={110} z={-30} hue={175} /></div></div>;
}

const FEATURES = [["🎯", "One match score", "Price, distance, safety and student reviews combined into a single score, shown openly so you can trust it."],
  ["⚖️", "Compare side by side", "Put up to three hostels next to each other and see the best value in every row."],
  ["🧮", "Semester cost calculator", "Rent, deposit, utilities, transport, food and data in one estimate, checked against your budget."],
  ["💬", "Hostel communities", "Anonymous reviews, warnings about management, second-hand items and a roommate board."],
  ["⚡", "Survival badges", "Electricity included, backup generator, water tank and shuttle route, visible at a glance."],
  ["📶", "Low-data mode", "Switch off photos, maps and animation to save your data bundle."]];

function Home({ campuses, stats, low, go }) {
  const [cid, setCid] = useState(""); const [budget, setBudget] = useState("");
  const nums = [[stats?.universities ?? campuses.length, "Universities"], [stats?.hostels ?? "–", "Hostels listed"], [stats?.roommates ?? "–", "Roommate profiles"], [stats?.posts ?? "–", "Community posts"]];
  return <div className="homepage">
    <section className="home"><div className="hwrap hgrid">
      <div className="htext"><span className="pill">Student housing across Uganda</span>
        <h1>Find a room you can <em>afford</em>, that feels <em>safe</em>, near campus.</h1>
        <p>Compare price, distance, safety and real student reviews in one match score, and plan your semester costs before you pay a shilling.</p>
        <form className="quick" onSubmit={e => { e.preventDefault(); go("find", cid, budget); }}>
          <label>Your university<select value={cid} onChange={e => setCid(e.target.value)}><option value="">Choose…</option>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Monthly budget (UGX)<input type="number" min="0" placeholder="Any" value={budget} onChange={e => setBudget(e.target.value)} /></label>
          <button className="btn">Find rooms</button></form>
        <p className="hlinks"><button className="link" onClick={() => go("unis")}>Browse universities</button> · <button className="link" onClick={() => go("list")}>List your hostel</button> · <button className="link" onClick={() => go("community")}>Join the community</button></p></div>
      <div className="hvisual">{!low && <Skyline />}</div></div></section>
    <section className="hwrap hstats">{nums.map(([n, l]) => <div key={l}><strong>{n}</strong><span>{l}</span></div>)}</section>
    <section className="hwrap"><h2 className="center">Everything a student needs before choosing a room</h2>
      <div className="fgrid">{FEATURES.map(([i, t, d]) => <article className="fcard" key={t}><span className="ficon">{i}</span><h3>{t}</h3><p>{d}</p></article>)}</div></section>
    <section className="hwrap"><h2 className="center">How it works</h2>
      <div className="steps3">{[["1", "Choose your university", "Pick from universities across Uganda, or add yours."], ["2", "Set your budget and distance", "Get a ranked list with a clear score breakdown."], ["3", "Compare, calculate, message", "Check the true semester cost and contact the landlord on WhatsApp."]].map(([n, t, d]) => <div className="step" key={n}><b>{n}</b><h3>{t}</h3><p>{d}</p></div>)}</div></section>
    <section className="hwrap cta"><h2>Own or manage a hostel?</h2><p>List your rooms for free and reach students looking near their campus.</p><button className="btn" onClick={() => go("list")}>List a room</button></section>
  </div>;
}

export default function App() {
  const [campuses, setCampuses] = useState([]); const [cid, setCid] = useState(null); const [view, setView] = useState("home");
  const [q, setQ] = useState({ budget: "", max_km: 5, room: "", sort: "match" }); const [list, setList] = useState([]); const [err, setErr] = useState("");
  const [low, setLow] = useState(() => { try { return localStorage.getItem("lowdata") === "1"; } catch { return false; } }); const [marks, setMarks] = useState([]); const [hub, setHub] = useState(null); const [stats, setStats] = useState(null); const [uniId, setUniId] = useState(null);
  const [open, setOpen] = useState(null); const [picked, setPicked] = useState([]); const [cmp, setCmp] = useState(false);
  const loadCampuses = sel => call("/campuses").then(c => { setCampuses(c); setCid(sel || cid || c[0]?.id); }).catch(e => setErr("Cannot reach the server. " + e.message));
  const campus = campuses.find(c => c.id === cid);
  const loadList = () => { if (!cid) return; const p = new URLSearchParams({ campus_id: cid, max_km: q.max_km, sort: q.sort }); if (q.budget) p.set("budget", q.budget); if (q.room) p.set("room", q.room); call("/hostels?" + p).then(setList).catch(e => setErr(e.message)); };
  useEffect(() => { try { localStorage.setItem("lowdata", low ? "1" : "0"); } catch { /* ignore */ } document.body.classList.toggle("lowdata", low); }, [low]);
  const loadMarks = () => { if (cid) call("/landmarks?campus_id=" + cid).then(setMarks).catch(() => {}); };
  useEffect(loadMarks, [cid]);
  useEffect(() => { call("/stats").then(setStats).catch(() => {}); }, [view]);
  const go = (v, id, budget) => { if (id) { setCid(+id); setPicked([]); } if (v === "find") setQ(x => ({ ...x, budget: budget || "" })); setView(v); window.scrollTo(0, 0); };
  useEffect(() => { loadCampuses(); }, []);
  useEffect(loadList, [cid, q, view]);
  const toggle = id => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : p.length < 3 ? [...p, id] : p);
  const items = list.filter(h => picked.includes(h.id));
  return <>
    <header><button className="brand" onClick={() => setView("home")}><img src="/logo.png" alt="" />CampusNest</button>
      <label className="pick">Your campus<select value={cid || ""} onChange={e => { setCid(+e.target.value); setPicked([]); }}>{campuses.map(c => <option key={c.id} value={c.id}>{c.name}{c.city ? ", " + c.city : ""}</option>)}</select></label>
      <label className="switch"><input type="checkbox" checked={low} onChange={e => setLow(e.target.checked)} />Low-data mode</label>
      <nav>{[["home", "Home"], ["find", "Find a room"], ["unis", "Universities"], ["community", "Community"], ["list", "List a room"], ["campus", "Add a campus"]].map(([k, l]) => <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>)}</nav></header>
    {err && <p className="err bar">{err}</p>}
    {!campus ? <main><p>Loading campuses…</p></main> : view === "home" ? <Home campuses={campuses} stats={stats} low={low} go={go} />
      : view === "list" ? <main className="one"><ListRoom campus={campus} done={() => { setView("find"); setQ({ ...q, max_km: 30 }); }} /></main>
      : view === "unis" ? <main className="one wide"><Universities list={campuses} low={low} onOpen={id => { setUniId(id); setView("uni"); }} /></main>
      : view === "uni" ? <main className="one wide"><UniPage id={uniId} low={low} reload={() => loadCampuses(cid)} onFind={() => { setCid(uniId); setPicked([]); setView("find"); }} onCommunity={() => { setCid(uniId); setView("community"); }} /></main>
      : view === "community" ? <main className="one wide"><Community campus={campus} startHostel={hub} /></main>
      : view === "campus" ? <main className="one"><AddCampus done={id => { loadCampuses(id); setView("find"); }} /></main> :
      <main>
        <Hero campus={campus} low={low} reload={() => loadCampuses(cid)} />
        <section>
          <h2>Rooms near {campus.name} <button className="link small" onClick={() => { setUniId(campus.id); setView("uni"); }}>About this university</button></h2>
          <div className="filters">
            <label>Monthly budget (UGX)<input type="number" min="0" placeholder="Any" value={q.budget} onChange={e => setQ({ ...q, budget: e.target.value })} /></label>
            <label>Within {q.max_km} km<input type="range" min="1" max="30" value={q.max_km} onChange={e => setQ({ ...q, max_km: e.target.value })} /></label>
            <label>Room type<select value={q.room} onChange={e => setQ({ ...q, room: e.target.value })}><option value="">Any</option><option>Shared</option><option>Single</option><option>Self-contained</option></select></label>
            <label>Sort by<select value={q.sort} onChange={e => setQ({ ...q, sort: e.target.value })}><option value="match">Best match</option><option value="price">Lowest price</option><option value="distance">Closest</option></select></label>
          </div>
          <p className="muted">Match score = price 30%, distance 30%, safety 25%, reviews 15%, compared with the other rooms in your results.</p>
          {list.length === 0 && <p className="empty">No rooms match. Raise your budget or widen the distance.</p>}
          {list.map(h => <article className="card" key={h.id} onMouseMove={tilt} onMouseLeave={untilt}>
            {!low && <div className="thumb">{h.photo ? <img src={img(h.photo)} alt={h.name + " room"} loading="lazy" /> : <span>No photo yet</span>}</div>}
            <div className="score"><strong>{h.score.total}</strong><small>match</small></div>
            <div className="body"><h3><button className="link" onClick={() => setOpen(h.id)}>{h.name}</button></h3>
              <p>{ugx(h.price)} / month · {h.distance_km} km · {h.room}</p>
              <p className="muted">Safety {h.safety_score.toFixed(1)}/5 · {h.n_reviews} reviews</p><Badges list={h.amenities} /><Breakdown s={h.score} /></div>
            <label className="cmp"><input type="checkbox" checked={picked.includes(h.id)} onChange={() => toggle(h.id)} />Compare</label></article>)}
          {!low && <AddLandmark campus={campus} done={loadMarks} />}
        </section>
        <aside>{low ? <p className="empty">Low-data mode is on, so the map is hidden. Turn it off in the header to see the map.</p> : <MapContainer key={campus.id} center={[campus.lat, campus.lng]} zoom={14} className="map"><TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap" />
          <CircleMarker center={[campus.lat, campus.lng]} radius={11} pathOptions={{ color: "#14213D", fillOpacity: .9 }}><Tooltip permanent>Campus</Tooltip></CircleMarker>
          {marks.map(m => <CircleMarker key={"m" + m.id} center={[m.lat, m.lng]} radius={7} pathOptions={{ color: "#F59E0B", fillOpacity: .9 }}><Tooltip permanent>{m.name}</Tooltip></CircleMarker>)}
          {list.map(h => <CircleMarker key={h.id} center={[h.lat, h.lng]} radius={8} pathOptions={{ color: "#0E9F8E", fillOpacity: .8 }} eventHandlers={{ click: () => setOpen(h.id) }}><Tooltip>{h.name} · {ugx(h.price)}</Tooltip></CircleMarker>)}</MapContainer>}</aside>
      </main>}
    {picked.length >= 2 && view === "find" && <div className="tray"><span>{picked.length} hostels selected</span><button className="btn" onClick={() => setCmp(true)}>Compare now</button><button className="link" onClick={() => setPicked([])}>Clear</button></div>}
    {open && <Detail id={open} dist={list.find(x => x.id === open)?.distance_km ?? 0} low={low} onHub={id => { setOpen(null); setHub(id); setView("community"); }} onClose={() => { setOpen(null); loadList(); }} />}
    {cmp && items.length >= 2 && <Compare items={items} onRemove={id => { toggle(id); if (items.length <= 2) setCmp(false); }} onClose={() => setCmp(false)} />}
  </>;
}