## Podcast Light

Minimal black/white podcast player site, **locked to one RSS feed**:
`https://anchor.fm/s/104b7e58/podcast/rss`

### Run locally

```bash
npm install
npm run update
open index.html
```

### Deploy on GitHub Pages

- Put these files in your repo (root is fine).
- Make sure `feed.json` is committed (run `npm run update` whenever you want fresh episodes).
- In GitHub repo settings → Pages → **Build and deployment**
  - Source: **Deploy from a branch**
  - Branch: `main` / `(root)`

