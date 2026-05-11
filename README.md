# LiveCode (LIVECODER)

Real-time collaborative coding: React, Node, Socket.IO, Monaco, MongoDB.

## Run locally

From the repo root:

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** (Vite proxies `/api` and `/socket.io` to `http://127.0.0.1:5001` by default). If your API uses another port, add `frontend/.env.development`:

```bash
VITE_DEV_BACKEND_URL=http://127.0.0.1:YOUR_PORT
```

A static preview of the landing look is at **http://localhost:5173/livecode-final-landing-preview.png** while the dev server is running (file in `frontend/public/`).