# 🧾 Resit Dashboard — Receipt & Payment Tracker

A full-stack personal finance dashboard to track receipts and payments — categories, charts, filters, and export. Stores data **locally in your browser** (no backend needed for the hosted version) or optionally connects to an **ASP.NET Core 8 + SQLite** backend for persistent server storage.

**Live demo is deployable to GitHub Pages (free, globally accessible).**

---

## 📸 Features

- 📊 Dashboard with doughnut + bar charts by category & month
- 🏷️ 10 built-in categories: Food, Transport, Toll/Highway, Utilities, Shopping, Healthcare, Entertainment, Grocery, Education, Others
- 🔍 Search, filter by month and category
- ➕ Add / Edit / Delete receipts with image reference field (WhatsApp msg ID or OneDrive link)
- 📥 Export to **CSV** or **JSON backup**
- 📤 Import from **JSON** (merge without duplicates)
- 💾 Works **offline** — data stored in browser localStorage
- 🌐 **Globally accessible** via GitHub Pages — no server needed
- 🔌 Optional: connect to .NET 8 REST API backend with SQLite for multi-device sync

---

## 🗂️ Project Structure

```
receipt-dashboard/
├── frontend/                   # React + Vite app (GitHub Pages)
│   ├── src/
│   │   ├── App.jsx             # Main app, state, nav
│   │   ├── index.css           # Global styles & CSS variables
│   │   └── components/
│   │       ├── Dashboard.jsx   # Charts & stats overview
│   │       ├── ReceiptList.jsx # Sortable/paginated table
│   │       └── AddReceiptModal.jsx
│   ├── .github/workflows/
│   │   └── deploy.yml          # Auto-deploy to GitHub Pages on push
│   ├── vite.config.js
│   └── package.json
│
└── backend/                    # ASP.NET Core 8 REST API (optional)
    ├── ReceiptDashboard.sln
    └── ReceiptDashboard.API/
        ├── Controllers/
        │   └── ReceiptsController.cs
        ├── Data/
        │   └── AppDbContext.cs
        ├── Models/
        │   └── Receipt.cs
        ├── Program.cs
        ├── appsettings.json
        └── ReceiptDashboard.API.csproj
```

---

## 🚀 Part 1 — Deploy Frontend to GitHub Pages (Free, Global Access)

### Step 1 — Fork / Create repo on GitHub

1. Go to [github.com](https://github.com) → **New repository**
2. Name it `receipt-dashboard` (or any name you prefer)
3. Set visibility to **Public** (required for free GitHub Pages)

### Step 2 — Push the code

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/receipt-dashboard.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. That's it! The `deploy.yml` workflow will automatically build and deploy on every push to `main`

### Step 4 — Access your dashboard

Your site will be live at:
```
https://YOUR_USERNAME.github.io/receipt-dashboard/
```

> ⚠️ **Important:** Open `frontend/vite.config.js` and make sure `VITE_BASE_PATH` matches your repo name. The deploy workflow sets this automatically via the `VITE_BASE_PATH` env variable.

---

## 💻 Part 2 — Run Frontend Locally (Development)

### Prerequisites
- Node.js 18+ → [nodejs.org](https://nodejs.org)

### Steps

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173)

### Build for production (manual)

```bash
cd frontend
npm run build
# Output is in frontend/dist/
```

---

## 🖥️ Part 3 — Run .NET 8 Backend (Optional — for server-side storage)

The frontend works **100% offline** using localStorage. The backend is optional — use it if you want receipts stored in a central SQLite database and accessible from multiple devices.

### Prerequisites

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)

### Run locally

```bash
cd backend
dotnet restore
dotnet run --project ReceiptDashboard.API
```

API runs at: `http://localhost:5000`  
Swagger UI: `http://localhost:5000/swagger`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/receipts` | List all (supports `?month=2025-06&category=food&search=tesco&page=1`) |
| GET | `/api/receipts/{id}` | Get single receipt |
| POST | `/api/receipts` | Create receipt |
| POST | `/api/receipts/bulk` | Bulk import (JSON array) |
| PUT | `/api/receipts/{id}` | Update receipt |
| DELETE | `/api/receipts/{id}` | Delete receipt |
| GET | `/api/receipts/summary` | Category totals + grand total |

### Configure CORS for GitHub Pages

Open `backend/ReceiptDashboard.API/appsettings.json` and set:

```json
{
  "AllowedOrigin": "https://YOUR_USERNAME.github.io"
}
```

---

## ☁️ Part 4 — Deploy Backend (Azure / Railway / Render)

### Option A — Azure App Service (Free Tier)

```bash
cd backend
dotnet publish -c Release -o ./publish

# Using Azure CLI
az login
az group create --name resit-rg --location southeastasia
az appservice plan create --name resit-plan --resource-group resit-rg --sku FREE --is-linux
az webapp create --name resit-api --resource-group resit-rg --plan resit-plan --runtime "DOTNET|8.0"
az webapp deploy --name resit-api --resource-group resit-rg --src-path ./publish
```

### Option B — Railway (Easiest, free tier available)

1. Go to [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Select your repo, set root to `backend/`
4. Add environment variable: `AllowedOrigin=https://YOUR_USERNAME.github.io`
5. Railway auto-detects .NET and deploys

### Option C — Render (Free tier)

1. Go to [render.com](https://render.com)
2. **New Web Service** → connect GitHub repo
3. Set **Root Directory** to `backend`
4. **Build Command:** `dotnet publish -c Release -o out`
5. **Start Command:** `dotnet out/ReceiptDashboard.API.dll`

---

## 🔗 Part 5 — Connect Frontend to Backend

Once your backend is deployed, add its URL to the frontend.

Create `frontend/.env`:
```env
VITE_API_URL=https://your-backend-url.com
```

Then in `frontend/src/App.jsx`, the app auto-detects the `VITE_API_URL` env variable and syncs to the backend instead of localStorage only.

---

## 📱 How to Add Receipts from WhatsApp / OneDrive

Since receipts are often shared on WhatsApp groups or stored on OneDrive:

1. **WhatsApp:** Note down the date and amount from the receipt image. When adding a receipt, paste the WhatsApp message link or note the sender/date in the **Image Reference** field.
2. **OneDrive:** Upload your receipt photo to OneDrive → **Share** → **Copy link** → paste into the **Image Reference** field when adding a receipt.

This keeps a text record linked to your actual receipt image.

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, Vite, Chart.js, date-fns |
| Styling | Pure CSS with CSS variables (no framework) |
| Fonts | Sora + JetBrains Mono (Google Fonts) |
| Storage | Browser localStorage (default) |
| Backend (optional) | ASP.NET Core 8, Entity Framework Core, SQLite |
| Hosting (frontend) | GitHub Pages (free, global) |
| Hosting (backend) | Azure / Railway / Render |
| CI/CD | GitHub Actions |

---

## 🐛 Troubleshooting

**Site shows 404 on GitHub Pages**
- Ensure GitHub Pages source is set to **GitHub Actions** (not branch)
- Check that `VITE_BASE_PATH` in the workflow matches your repo name exactly

**Charts not rendering**
- Hard-refresh the page (Ctrl+Shift+R)
- Check browser console for errors

**Data lost after clearing browser**
- Use the **Backup JSON** button regularly to save a local copy
- Or set up the .NET backend for persistent storage

**CORS errors when connecting to backend**
- Ensure `AllowedOrigin` in `appsettings.json` matches your GitHub Pages URL exactly (no trailing slash)

---

## 📄 License

MIT — free to use, modify, and deploy.
