import math, os, sqlite3
from flask import Flask, g, jsonify, request
from flask_cors import CORS

DB = os.environ.get("DB_PATH", "campusnest.db")
W = {"price": 0.30, "distance": 0.30, "safety": 0.25, "reviews": 0.15}  # match-score weights
app = Flask(__name__)
CORS(app)

SCHEMA = """
CREATE TABLE IF NOT EXISTS campus(id INTEGER PRIMARY KEY, name TEXT, city TEXT, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS hostel(id INTEGER PRIMARY KEY, name TEXT, price INTEGER, room TEXT, amenities TEXT,
  phone TEXT, description TEXT, lat REAL, lng REAL, safety REAL DEFAULT 3);
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
      COALESCE(AVG(r.safety), h.safety) AS safety_score FROM hostel h LEFT JOIN review r ON r.hostel_id=h.id GROUP BY h.id""").fetchall()

def seed():
    d = sqlite3.connect(DB)
    d.executescript(SCHEMA)
    if d.execute("SELECT COUNT(*) FROM campus").fetchone()[0]:
        d.close(); return
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
    d.commit(); d.close()

@app.get("/api/campuses")
def campuses():
    return jsonify([dict(r) for r in db().execute("SELECT * FROM campus ORDER BY name")])

@app.post("/api/campuses")
def add_campus():
    b = request.get_json(force=True)
    if not b.get("name") or b.get("lat") is None or b.get("lng") is None:
        return jsonify(error="Name and map pin are required."), 400
    cur = db().execute("INSERT INTO campus(name,city,lat,lng) VALUES(?,?,?,?)", (b["name"].strip(), b.get("city", "").strip(), b["lat"], b["lng"]))
    db().commit()
    return jsonify(id=cur.lastrowid), 201

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
    h["reviews"] = [dict(r) for r in db().execute("SELECT rating,safety,comment FROM review WHERE hostel_id=? ORDER BY id DESC", (hid,))]
    return jsonify(h)

@app.post("/api/hostels")
def add_hostel():
    b = request.get_json(force=True)
    if not b.get("name") or not b.get("price") or b.get("lat") is None:
        return jsonify(error="Name, price and map pin are required."), 400
    cur = db().execute("INSERT INTO hostel(name,price,room,amenities,phone,description,lat,lng) VALUES(?,?,?,?,?,?,?,?)",
                       (b["name"].strip(), int(b["price"]), b.get("room", "Shared"), ",".join(b.get("amenities", [])), b.get("phone", ""), b.get("description", ""), b["lat"], b["lng"]))
    db().commit()
    return jsonify(id=cur.lastrowid), 201

@app.post("/api/hostels/<int:hid>/reviews")
def add_review(hid):
    b = request.get_json(force=True)
    if not (1 <= int(b.get("rating", 0)) <= 5 and 1 <= int(b.get("safety", 0)) <= 5):
        return jsonify(error="Ratings must be between 1 and 5."), 400
    db().execute("INSERT INTO review(hostel_id,rating,safety,comment) VALUES(?,?,?,?)", (hid, b["rating"], b["safety"], b.get("comment", "")[:300]))
    db().commit()
    return jsonify(ok=True), 201

seed()
if __name__ == "__main__":
    app.run(debug=True, port=5000)
