# Graficul litigiilor în materia achizițiilor publice

Site static, gratuit, fără cont: un grafic 3D al deciziilor posibile în litigiile de achiziții publice (Legea 101/2016) și ghidul practic complet.

## Structură
- `harta/src/data.js` — conținutul hărții: etape (NODES), legături (EDGES), trasee (PATHS), sărbători legale (HOLIDAYS).
- `harta/src/main.js` — logica hărții 3D (Three.js).
- `harta/src/page.html` — aspectul paginii hărții.
- `ghid/ghid_tpl.html` — aspectul paginii ghidului.
- `ghid/doc.xml` — exportul documentului Claude Docs „Ghid practic — Litigiile în materia achizițiilor publice”; `ghid/embeds/` — diagramele lui.
- `ghid/body.html`, `ghid/toc.json`, `ghid/embeds.json` — generate din cele de mai sus (`npm run ghid`, `npm run embeds`).

## Construire
```
npm install
npm run build      # rezultă harta/site/, publicat de Netlify
```
Netlify rulează automat `npm run build` la fiecare commit pe `main` (vezi `netlify.toml`).
