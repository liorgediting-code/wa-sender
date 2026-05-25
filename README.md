# WA Bulk Sender

Send WhatsApp messages to a list of numbers via Green API. Hosted on Vercel.

## Deploy in 3 steps

### 1. Push to GitHub
```bash
git init
git add .
git commit -m "init"
gh repo create wa-sender --private --push
```

### 2. Deploy to Vercel
```bash
npx vercel
```
Or go to vercel.com → New Project → import your repo → Deploy.  
No environment variables needed — credentials are entered in the UI and saved in the browser.

### 3. Share the URL
Send the Vercel URL to Liav. Each person enters their own Green API credentials — they're saved in their own browser's localStorage and never sent to your server (only forwarded to Green API).

## How it works
- Frontend sends `POST /api/send` with `{ instance, token, chatId, message }`
- The Next.js API route proxies the request to Green API server-side (no CORS issues)
- Credentials are never stored on the server

## Local dev
```bash
npm install
npm run dev
```
