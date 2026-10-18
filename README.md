# CampusNest
Compare student housing near **any** campus by price, distance, safety and reviews. Students pick their campus, set a budget and distance, and get a ranked list with a transparent match score. Landlords list rooms by dropping a pin; anyone can add a new campus.

## Run locally
```
cd backend && python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt && python app.py                   # API on :5000 (auto-creates + seeds campusnest.db)
cd ../frontend && npm install && npm run dev                       # UI on :5173 (proxies /api to :5000)
```
## Deploy
- Backend (Render): root `backend`, build `pip install -r requirements.txt`, start `gunicorn app:app`.
- Frontend (Netlify/Vercel): root `frontend`, build `npm run build`, publish `dist`, env `VITE_API=https://<your-backend>.onrender.com/api`.
- Note: free Render disks reset, so seed data is re-created on restart. Use PostgreSQL if you need persistence.

## How the match score works
Price and distance are min-max normalised against the other results (cheaper/closer = higher); safety and reviews come from student ratings (1-5). Weights: price 30%, distance 30%, safety 25%, reviews 15% (see `W` in `backend/app.py`).
Distance is the haversine formula from the chosen campus pin to each hostel pin.

## Data
Seeded hostels, prices and reviews are **sample data for demo only**.
