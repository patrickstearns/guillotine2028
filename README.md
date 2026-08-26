# Guillotine 2028

Online multiplayer HTML remake of *Guillotine*, rethemed for a 2028 US leftist revolution.

## Features

- Lobby with open games list
- Waiting room with house-rules placeholder
- Host start + optional AI seats (1–4 players)
- Full noble + action card sets (classic structure, modern figures)
- In-game hand rail, noble line, score sidebar, Day toasts, results screen
- Gear menu → quit to lobby
- WebRTC video chat (mute / close) with Socket.IO signaling

Must-include nobles: **Donald Trump**, **Melania Trump**, **Elon Musk**.

## Local development

```bash
npm install
node scripts/generate-portraits.mjs
npm run dev
```

- Client: http://localhost:5173 (proxies Socket.IO to the server)
- Server: http://localhost:3001

Open multiple browser windows (or profiles) to play multiplayer locally. Allow camera/mic for video chat.

## Production-style run

```bash
npm install
node scripts/generate-portraits.mjs
npm run build
npm start
```

Then open http://localhost:3001

## Deploy later

Build outputs:

- `dist/` — static client
- `dist-server/` — compiled server (after `tsc -p tsconfig.server.json`)

Point a Node host at `npm start` with `PORT` set. For WebRTC across NATs you may later add a TURN server to `src/webrtc.ts`.
"# guillotine2028" 
