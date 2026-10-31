"""Copy the photos you uploaded locally into frontend/public so they are deployed with the site.
Run from the backend folder:  python export_photos.py
Universities  -> ../frontend/public/campus/<university-name>.jpg
Sample hostels (ids 1-15) -> ../frontend/public/hostels/<id>.jpg
"""
import os, re, shutil, sqlite3

DB, UPLOADS, PUBLIC = "campusnest.db", "uploads", os.path.join("..", "frontend", "public")
try:
    from PIL import Image
except ImportError:
    Image = None
    print("Pillow is not installed, so photos will be copied without shrinking (pip install pillow to shrink them).")

slug = lambda s: re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def export(src_name, dest_dir, dest_name):
    src = os.path.join(UPLOADS, os.path.basename(src_name))
    if not os.path.exists(src):
        print("  missing file:", src); return
    os.makedirs(dest_dir, exist_ok=True)
    if Image:
        im = Image.open(src).convert("RGB"); im.thumbnail((1200, 1200))
        dest = os.path.join(dest_dir, dest_name + ".jpg"); im.save(dest, "JPEG", quality=80)
    else:
        dest = os.path.join(dest_dir, dest_name + os.path.splitext(src)[1].lower()); shutil.copy(src, dest)
    print("  saved", dest)

d = sqlite3.connect(DB)
print("Universities:")
for name, photo in d.execute("SELECT name, photo FROM campus WHERE photo IS NOT NULL"):
    export(photo, os.path.join(PUBLIC, "campus"), slug(name))
print("Sample hostels:")
for hid, photo in d.execute("SELECT hostel_id, MIN(filename) FROM hostel_photo WHERE hostel_id<=15 GROUP BY hostel_id"):
    export(photo, os.path.join(PUBLIC, "hostels"), str(hid))
print("Done. Now commit and push so Netlify redeploys.")
