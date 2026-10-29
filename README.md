# ZenvoX Ride — upgraded source

This ZIP preserves the original app and adds a YouTube discovery tab plus AI attachment UI and an optional secure AI backend starter.

## Run the frontend
1. Extract the ZIP.
2. Open the `Zenvo-Ride-For-Biker-main` folder in Spck Editor.
3. Open `index.html` and preview it. The original map needs internet access and Leaflet/tile providers to load.
4. The existing map, ride/shop, profile, social feed, and other original modules are retained.

## YouTube feed
Open Social → YouTube → Configure API. Create a YouTube Data API v3 key in Google Cloud Console and restrict it by website/referrer. Paste the key into the prompt. Search and pagination use the official YouTube Data API; videos play through the official YouTube embedded player. API quota and YouTube terms apply. The key is stored in this browser's local storage and must be referrer-restricted; it is not a server secret.

## AI text and attachments
The plus button allows camera or file selection. To get real AI answers and file analysis, deploy the optional `backend` folder and configure its endpoint in `config.js`:

```js
window.ZENVO_CONFIG = { aiEndpoint: 'https://YOUR-BACKEND-DOMAIN/api/ai/chat' };
```

### Deploy backend locally
1. Install Node.js 20 or later on a computer/server (Spck alone does not run this Node backend).
2. In `backend`, run `npm install`.
3. Copy `.env.example` to `.env` and add your secret `OPENAI_API_KEY`, model, and correct `FRONTEND_ORIGIN`.
4. Run `npm start` and test `/health`.
5. Deploy the backend to a compatible HTTPS host (e.g. Render) and set the environment variables in the host dashboard. Never put `OPENAI_API_KEY` in frontend files or the ZIP.
6. Update `config.js` with the deployed HTTPS endpoint and redeploy the frontend.

## Firebase / calls / chat
The original project already contains optional Firebase real-time chat and WebRTC signaling code. To use cross-device features, configure your Firebase project values in `script.js`, enable Realtime Database, and create restrictive security rules before sharing the app. The current RTC configuration uses public STUN servers only; reliable calls across restrictive networks require a TURN service. This starter has not been production-security-audited; do not expose an open database to the public. Firebase Authentication, enforceable user identity, push notifications, and scalable group calls require additional implementation/configuration.

## Important truthful limitations
- Without a YouTube Data API key, live search/pagination will not load.
- Without a deployed AI backend and valid provider key, AI responses fall back to local guidance and attachments are not actually analyzed.
- Cross-device messaging/calls require correctly configured Firebase and safe database rules. The included calling code is one-to-one WebRTC signaling, not a scalable group-call system.
- Siren playback, location, camera, microphone, and notifications depend on device permissions and browser/HTTPS restrictions.
- The existing map code and map-related UI were preserved; actual tiles and live location depend on network and device permissions.
