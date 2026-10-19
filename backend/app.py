import math, os, sqlite3, uuid
from flask import Flask, g, jsonify, request, send_from_directory
from flask_cors import CORS

DB = os.environ.get("DB_PATH", "campusnest.db")
W = {"price": 0.30, "distance": 0.30, "safety": 0.25, "reviews": 0.15}  # match-score weights
app = Flask(__name__)
CORS(app)
UPLOADS = os.environ.get("UPLOAD_DIR", "uploads")
os.makedirs(UPLOADS, exist_ok=True)
app.config["MAX_CONTENT_LENGTH"] = 40 * 1024 * 1024

SCHEMA = """
CREATE TABLE IF NOT EXISTS campus(id INTEGER PRIMARY KEY, name TEXT, city TEXT, lat REAL, lng REAL, photo TEXT, type TEXT, website TEXT, about TEXT);
CREATE TABLE IF NOT EXISTS post(id INTEGER PRIMARY KEY, hostel_id INTEGER, kind TEXT, title TEXT, body TEXT, price INTEGER, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS roommate(id INTEGER PRIMARY KEY, campus_id INTEGER, course TEXT, year INTEGER, budget INTEGER, habits TEXT, note TEXT, phone TEXT, created TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS landmark(id INTEGER PRIMARY KEY, campus_id INTEGER, name TEXT, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS hostel_photo(id INTEGER PRIMARY KEY, hostel_id INTEGER, filename TEXT);
CREATE TABLE IF NOT EXISTS hostel(id INTEGER PRIMARY KEY, name TEXT, price INTEGER, room TEXT, amenities TEXT,
  phone TEXT, description TEXT, lat REAL, lng REAL, safety REAL DEFAULT 3, deposit INTEGER DEFAULT 0, utilities INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS review(id INTEGER PRIMARY KEY, hostel_id INTEGER, rating INTEGER, safety INTEGER, comment TEXT);
"""

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close(_):
    d = g.pop("db", None)
    if d:
        d.close()

def haversine(lat1, lng1, lat2, lng2):
    p = math.pi / 180
    a = math.sin((lat2 - lat1) * p / 2) ** 2 + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lng2 - lng1) * p / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))

def norm_low_is_good(v, lo, hi):
    return 100.0 if hi == lo else 100 * (hi - v) / (hi - lo)

def hostel_rows():
    return db().execute("""SELECT h.*, COALESCE(AVG(r.rating),0) AS avg_rating, COUNT(r.id) AS n_reviews,
      COALESCE(AVG(r.safety), h.safety) AS safety_score,
      (SELECT filename FROM hostel_photo p WHERE p.hostel_id=h.id ORDER BY p.id LIMIT 1) AS photo FROM hostel h LEFT JOIN review r ON r.hostel_id=h.id GROUP BY h.id""").fetchall()

# Name, town, approximate latitude/longitude, type. Pins are approximate: users can move them from the university page.
UNIS = [("Gulu University", "Gulu", 2.7800, 32.3000, "Public"), ("Busitema University", "Busia", 0.4300, 34.0200, "Public"),
        ("Kabale University", "Kabale", -1.2540, 29.9930, "Public"), ("Lira University", "Lira", 2.2400, 32.9000, "Public"),
        ("Muni University", "Arua", 3.0300, 30.9000, "Public"), ("Soroti University", "Soroti", 1.7150, 33.6110, "Public"),
        ("Makerere University Business School", "Kampala", 0.3290, 32.6120, "Public"), ("Uganda Christian University", "Mukono", 0.3530, 32.7550, "Private"),
        ("Kampala International University", "Kampala", 0.2930, 32.5990, "Private"), ("Islamic University in Uganda", "Mbale", 1.0750, 34.1700, "Private")]

def seed_unis(d):
    for n, city, lat, lng, t in UNIS:
        if not d.execute("SELECT 1 FROM campus WHERE name=?", (n,)).fetchone():
            d.execute("INSERT INTO campus(name,city,lat,lng,type) VALUES(?,?,?,?,?)", (n, city, lat, lng, t))
    d.execute("UPDATE campus SET type='Public' WHERE type IS NULL AND name IN ('Makerere University','Kyambogo University','Mbarara University of Science and Technology')")

def enrich(d):
    """Demo data: more universities, survival-amenity badges and cost values for the sample hostels (ids 1-15). Safe to run repeatedly."""
    seed_unis(d)
    d.execute("UPDATE hostel SET amenities=REPLACE(amenities,'Backup power','Backup generator')")
    d.execute("UPDATE hostel SET amenities=amenities||',Water tank' WHERE id<=15 AND id%2=0 AND amenities NOT LIKE '%Water tank%'")
    d.execute("UPDATE hostel SET amenities=amenities||',Electricity included' WHERE id<=15 AND id%3=0 AND amenities NOT LIKE '%Electricity included%'")
    d.execute("UPDATE hostel SET amenities=amenities||',Shuttle route' WHERE id IN (2,4,8,9,14) AND amenities NOT LIKE '%Shuttle route%'")
    d.execute("UPDATE hostel SET deposit=100000, utilities=25000 WHERE id<=15 AND deposit=0 AND amenities NOT LIKE '%Electricity included%'")
    d.commit()

def seed():
    d = sqlite3.connect(DB)
    d.executescript(SCHEMA)
    for stmt in ("ALTER TABLE campus ADD COLUMN photo TEXT", "ALTER TABLE hostel ADD COLUMN deposit INTEGER DEFAULT 0",
                 "ALTER TABLE hostel ADD COLUMN utilities INTEGER DEFAULT 0", "ALTER TABLE campus ADD COLUMN type TEXT",
                 "ALTER TABLE campus ADD COLUMN website TEXT", "ALTER TABLE campus ADD COLUMN about TEXT"):  # upgrade older databases
        try:
            d.execute(stmt)
        except sqlite3.OperationalError:
            pass
    if d.execute("SELECT COUNT(*) FROM campus").fetchone()[0]:
        enrich(d); d.close(); return
    campuses = [("Makerere University", "Kampala", 0.3340, 32.5680), ("Kyambogo University", "Kampala", 0.3500, 32.6300),
                ("Mbarara University of Science and Technology", "Mbarara", -0.6130, 30.6580)]
    d.executemany("INSERT INTO campus(name,city,lat,lng) VALUES(?,?,?,?)", campuses)
    # name, price/semester-month UGX, room, amenities, offset lat, offset lng, safety   (SAMPLE DATA)
    sample = [
        ("Wandegeya Budget Rooms", 180000, "Shared", "Water,Wi-Fi", 0.004, -0.003, 3), ("Kikoni Scholars Hostel", 260000, "Single", "Water,Wi-Fi,Security guard", 0.010, 0.004, 4),
        ("Bwaise Student Lodge", 120000, "Shared", "Water", 0.020, -0.012, 2), ("Mulago Heights Hostel", 350000, "Self-contained", "Water,Wi-Fi,Security guard,Backup power", -0.008, 0.009, 5),
        ("Ntinda Study Inn", 220000, "Single", "Water,Wi-Fi,Backup power", 0.030, 0.050, 4),
        ("Banda Gate Hostel", 200000, "Shared", "Water,Wi-Fi", 0.003, 0.004, 3), ("Kireka Student Rooms", 140000, "Shared", "Water", -0.020, 0.030, 2),
        ("Kyambogo Hilltop Hostel", 300000, "Single", "Water,Wi-Fi,Security guard", 0.006, -0.008, 4), ("Naguru Scholars Court", 380000, "Self-contained", "Water,Wi-Fi,Security guard,Backup power", 0.020, -0.030, 5),
        ("Banda Budget Single", 170000, "Single", "Water", -0.004, 0.012, 3),
        ("Kihumuro Student Home", 130000, "Shared", "Water,Wi-Fi", 0.012, 0.010, 3), ("Ruharo Scholars Hostel", 240000, "Single", "Water,Wi-Fi,Security guard", -0.006, -0.004, 4),
        ("Kakoba Budget Rooms", 100000, "Shared", "Water", 0.030, -0.020, 2), ("Nyamitanga Executive Hostel", 330000, "Self-contained", "Water,Wi-Fi,Security guard,Backup power", 0.002, 0.016, 5),
        ("Booma Student Lodge", 190000, "Single", "Water,Wi-Fi", -0.012, -0.012, 3)]
    for i, (n, p, r, a, dy, dx, s) in enumerate(sample):
        c = campuses[i // 5]
        d.execute("INSERT INTO hostel(name,price,room,amenities,phone,description,lat,lng,safety) VALUES(?,?,?,?,?,?,?,?,?)",
                  (n, p, r, a, f"25670000{i:04d}", "Sample listing for demo purposes.", c[2] + dy, c[3] + dx, s))
        for k in range(2):
            d.execute("INSERT INTO review(hostel_id,rating,safety,comment) VALUES(?,?,?,?)",
                      (i + 1, max(1, min(5, s + (k - 1))), s, ["Clean and quiet.", "Fair price for the area.", "Landlord responds quickly."][(i + k) % 3]))
    enrich(d); d.commit(); d.close()

def campus_stats(c, hs):
    near = [h["price"] for h in hs if haversine(c["lat"], c["lng"], h["lat"], h["lng"]) <= 10]
    return {"n_hostels": len(near), "min_price": min(near) if near else None, "avg_price": round(sum(near) / len(near)) if near else None}

@app.get("/api/campuses")
def campuses():
    hs = db().execute("SELECT price,lat,lng FROM hostel").fetchall()
    out = []
    for r in db().execute("SELECT * FROM campus ORDER BY name"):
        c = dict(r); c.update(campus_stats(c, hs)); out.append(c)
    return jsonify(out)

@app.get("/api/campuses/<int:cid>")
def campus_one(cid):
    r = db().execute("SELECT * FROM campus WHERE id=?", (cid,)).fetchone()
    if not r:
        return jsonify(error="University not found."), 404
    c = dict(r); c.update(campus_stats(c, db().execute("SELECT price,lat,lng FROM hostel").fetchall()))
    c["landmarks"] = [dict(x) for x in db().execute("SELECT * FROM landmark WHERE campus_id=?", (cid,))]
    c["n_roommates"] = db().execute("SELECT COUNT(*) FROM roommate WHERE campus_id=?", (cid,)).fetchone()[0]
    return jsonify(c)

@app.put("/api/campuses/<int:cid>")
def edit_campus(cid):
    b = request.get_json(force=True)
    site = (b.get("website") or "").strip()[:200]
    if site and not site.lower().startswith(("http://", "https://")):
        site = "https://" + site
    db().execute("UPDATE campus SET city=?, type=?, website=?, about=? WHERE id=?",
                 ((b.get("city") or "").strip()[:60], b.get("type") if b.get("type") in ("Public", "Private") else "", site, (b.get("about") or "").strip()[:800], cid))
    if b.get("lat") is not None and b.get("lng") is not None:
        db().execute("UPDATE campus SET lat=?, lng=? WHERE id=?", (float(b["lat"]), float(b["lng"]), cid))
    db().commit()
    return jsonify(ok=True)

def save_photo(f):
    ext = os.path.splitext(f.filename or "")[1].lower()
    if ext not in (".jpg", ".jpeg", ".png", ".webp"):
        return None
    name = uuid.uuid4().hex + ext
    f.save(os.path.join(UPLOADS, name))
    return name

def add_photos(hid, files):
    n = 0
    for f in files[:5]:
        name = save_photo(f)
        if name:
            db().execute("INSERT INTO hostel_photo(hostel_id,filename) VALUES(?,?)", (hid, name)); n += 1
    db().commit()
    return n

@app.get("/api/uploads/<path:name>")
def uploads(name):
    return send_from_directory(UPLOADS, name)

@app.post("/api/campuses")
def add_campus():
    b = request.form
    if not b.get("name") or not b.get("lat") or not b.get("lng"):
        return jsonify(error="Name and map pin are required."), 400
    photo = save_photo(request.files["photo"]) if "photo" in request.files else None
    cur = db().execute("INSERT INTO campus(name,city,lat,lng,photo) VALUES(?,?,?,?,?)", (b["name"].strip(), b.get("city", "").strip(), float(b["lat"]), float(b["lng"]), photo))
    db().commit()
    return jsonify(id=cur.lastrowid), 201

@app.post("/api/campuses/<int:cid>/photo")
def campus_photo(cid):
    name = save_photo(request.files["photo"]) if "photo" in request.files else None
    if not name:
        return jsonify(error="Upload a JPG, PNG or WebP image."), 400
    db().execute("UPDATE campus SET photo=? WHERE id=?", (name, cid)); db().commit()
    return jsonify(photo=name)

@app.get("/api/hostels")
def hostels():
    c = db().execute("SELECT * FROM campus WHERE id=?", (request.args.get("campus_id", type=int),)).fetchone()
    if not c:
        return jsonify(error="Choose a campus first."), 400
    budget, max_km, room = request.args.get("budget", type=int), request.args.get("max_km", 5, type=float), request.args.get("room")
    out = []
    for r in hostel_rows():
        h = dict(r); h["distance_km"] = round(haversine(c["lat"], c["lng"], h["lat"], h["lng"]), 2)
        if h["distance_km"] > max_km or (budget and h["price"] > budget) or (room and h["room"] != room):
            continue
        h["amenities"] = [a for a in h["amenities"].split(",") if a]
        out.append(h)
    if out:
        pl, ph = min(h["price"] for h in out), max(h["price"] for h in out)
        dl, dh = min(h["distance_km"] for h in out), max(h["distance_km"] for h in out)
        for h in out:
            s = {"price": norm_low_is_good(h["price"], pl, ph), "distance": norm_low_is_good(h["distance_km"], dl, dh),
                 "safety": (h["safety_score"] - 1) / 4 * 100, "reviews": ((h["avg_rating"] or 3) - 1) / 4 * 100}
            s = {k: round(v) for k, v in s.items()}
            s["total"] = round(sum(s[k] * W[k] for k in W))
            h["score"] = s
    key = {"price": lambda h: h["price"], "distance": lambda h: h["distance_km"]}.get(request.args.get("sort", "match"), lambda h: -h["score"]["total"])
    return jsonify(sorted(out, key=key))

@app.get("/api/hostels/<int:hid>")
def hostel(hid):
    h = next((dict(r) for r in hostel_rows() if r["id"] == hid), None)
    if not h:
        return jsonify(error="Hostel not found."), 404
    h["amenities"] = [a for a in h["amenities"].split(",") if a]
    h["photos"] = [r["filename"] for r in db().execute("SELECT filename FROM hostel_photo WHERE hostel_id=? ORDER BY id", (hid,))]
    h["reviews"] = [dict(r) for r in db().execute("SELECT rating,safety,comment FROM review WHERE hostel_id=? ORDER BY id DESC", (hid,))]
    return jsonify(h)

@app.post("/api/hostels")
def add_hostel():
    b = request.form
    if not b.get("name") or not b.get("price") or not b.get("lat"):
        return jsonify(error="Name, price and map pin are required."), 400
    cur = db().execute("INSERT INTO hostel(name,price,room,amenities,phone,description,lat,lng,deposit,utilities) VALUES(?,?,?,?,?,?,?,?,?,?)",
                       (b["name"].strip(), int(b["price"]), b.get("room", "Shared"), b.get("amenities", ""), b.get("phone", ""), b.get("description", ""), float(b["lat"]), float(b["lng"]),
                        int(b.get("deposit") or 0), int(b.get("utilities") or 0)))
    add_photos(cur.lastrowid, request.files.getlist("photos"))
    return jsonify(id=cur.lastrowid), 201

@app.post("/api/hostels/<int:hid>/photos")
def hostel_photos(hid):
    if not add_photos(hid, request.files.getlist("photos")):
        return jsonify(error="Upload a JPG, PNG or WebP image."), 400
    return jsonify(ok=True), 201

@app.post("/api/hostels/<int:hid>/reviews")
def add_review(hid):
    b = request.get_json(force=True)
    if not (1 <= int(b.get("rating", 0)) <= 5 and 1 <= int(b.get("safety", 0)) <= 5):
        return jsonify(error="Ratings must be between 1 and 5."), 400
    db().execute("INSERT INTO review(hostel_id,rating,safety,comment) VALUES(?,?,?,?)", (hid, b["rating"], b["safety"], b.get("comment", "")[:300]))
    db().commit()
    return jsonify(ok=True), 201

@app.get("/api/hostels/<int:hid>/posts")
def posts(hid):
    return jsonify([dict(r) for r in db().execute("SELECT * FROM post WHERE hostel_id=? ORDER BY id DESC LIMIT 100", (hid,))])

@app.post("/api/hostels/<int:hid>/posts")
def add_post(hid):
    b = request.get_json(force=True)
    title, body = (b.get("title") or "").strip()[:80], (b.get("body") or "").strip()[:500]
    if b.get("kind") not in ("review", "warning", "sale") or not title or not body:
        return jsonify(error="Choose a type and add a title and a message."), 400
    price = int(b["price"]) if b["kind"] == "sale" and str(b.get("price") or "").isdigit() else None
    db().execute("INSERT INTO post(hostel_id,kind,title,body,price) VALUES(?,?,?,?,?)", (hid, b["kind"], title, body, price))
    db().commit()
    return jsonify(ok=True), 201

@app.get("/api/roommates")
def roommates():
    return jsonify([dict(r) for r in db().execute("SELECT * FROM roommate WHERE campus_id=? ORDER BY id DESC LIMIT 100", (request.args.get("campus_id", type=int),))])

@app.post("/api/roommates")
def add_roommate():
    b = request.get_json(force=True)
    course = (b.get("course") or "").strip()[:60]
    if not course or not str(b.get("budget") or "").isdigit() or not b.get("campus_id"):
        return jsonify(error="Course and monthly budget are required."), 400
    phone = "".join(c for c in (b.get("phone") or "") if c.isdigit())[:15]
    db().execute("INSERT INTO roommate(campus_id,course,year,budget,habits,note,phone) VALUES(?,?,?,?,?,?,?)",
                 (b["campus_id"], course, int(b.get("year") or 1), int(b["budget"]), (b.get("habits") or "Flexible")[:30], (b.get("note") or "").strip()[:200], phone))
    db().commit()
    return jsonify(ok=True), 201

@app.get("/api/landmarks")
def landmarks():
    return jsonify([dict(r) for r in db().execute("SELECT * FROM landmark WHERE campus_id=?", (request.args.get("campus_id", type=int),))])

@app.post("/api/landmarks")
def add_landmark():
    b = request.get_json(force=True)
    if not (b.get("name") or "").strip() or b.get("lat") is None or b.get("lng") is None or not b.get("campus_id"):
        return jsonify(error="Name and map pin are required."), 400
    db().execute("INSERT INTO landmark(campus_id,name,lat,lng) VALUES(?,?,?,?)", (b["campus_id"], b["name"].strip()[:60], b["lat"], b["lng"]))
    db().commit()
    return jsonify(ok=True), 201

@app.get("/api/stats")
def stats():
    n = lambda t: db().execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    return jsonify(universities=n("campus"), hostels=n("hostel"), posts=n("post"), roommates=n("roommate"))

seed()
if __name__ == "__main__":
    app.run(debug=True, port=5000)