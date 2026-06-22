# Ocarina Fingering Coach

Static client-side web app for practicing 12-hole transverse ocarina fingering with camera-based hand tracking.

## Local Run

```bash
npm run serve
```

Open `http://localhost:4173/ocarina-fingering-coach/`.

## Verification

```bash
npm test
npm run build:data
```

The fingering data is generated from `../01 Source/ocarina_fingering_charts_by_type(Claude)[All]/음별_20/*.svg`.

## Deployment

The Vercel project is connected to the GitHub repository and uses `ocarina-fingering-coach` as the root directory. Pushes to `main` create production deployments automatically.
