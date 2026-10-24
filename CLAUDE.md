# Graficul litigiilor în materia achizițiilor publice

Note de predare pentru sesiunile Claude care lucrează în acest repository.
Proprietar: Serban, avocat litigant (Managing Associate). Toată comunicarea și conținutul site-ului sunt în limba română.

## Ce este
Site static, gratuit, fără cont, publicat pe Netlify din acest repository (`netlify.toml`: `npm run build`, publică `harta/site`). Are trei pagini, în ordinea din bara de sus: Ghidul, Graficul, Despre.
- **Ghidul** (`index.html`, pagina principală; adresa veche `ghid.html` e redirecționată spre „/” în `netlify.toml`): ghidul practic complet al lui Serban, cu cuprins în bara laterală. Dacă adresa are un fragment care e id de etapă (`/#d_doc`, din linkurile vechi spre grafic), pagina trimite automat la `grafic.html#d_doc`.
- **Graficul** (`grafic.html`; în cod și în numele fișierelor se numește încă „harta”): o schemă de flux 2D (SVG, așezată automat cu dagre), de sus în jos, cu fazele încadrate în casete, cu toate deciziile posibile în litigiile de achiziții publice de până la încheierea contractului, adică Partea II a ghidului. Nu e un joc, ci o reprezentare a ramificațiilor. Pe site se spune „graficul”, nu „harta”; excepție face diagrama „Harta căilor de atac” din textul ghidului.
- **Despre** (`despre.html`): prezentarea lui Serban, data actualizării, contact.

Conținutul provine EXCLUSIV din ghidul lui Serban. Nu adăuga reguli juridice din memorie. Orice text nou se citează la secțiunea din ghid și la articol.

## Structura
- `harta/src/data.js` — sursa de adevăr pentru hartă:
  - `PHASES` — fazele (casetele graficului 2D); fiecare etapă aparține exact unei faze.
  - `NODES` — etapele. Câmpuri: `id`, `type` (moment, decizie — întrebare, raspuns — Da/Nu, act — act al AC, remediu, solutie, risc, faza — trimitere la altă fază, cu `go`: etapa/etapele la care duce), `pos` (centrul casetei în schema draw.io a lui Serban; graficul așază fazele după el), `roles` (ofertant, castigator, ac), `t` (titlu), `s` (eticheta scurtă), `sum`, `f` (perechi [etichetă, text]), `warn`, `calc` (`{zile:[peste,sub], de:'...'}` pentru calculatorul de termene), `ref` (secțiunile din ghid), `art`.
  - `EDGES` — legăturile, ca `[from, to, eticheta, kind, hint?]`, cu kind: flow, choice, risk, loop (revenire, linie întreruptă). Eticheta poate avea mai multe rânduri (`\n`) și poate lipsi. `hint` vine din draw.io: `w` = puncte intermediare, `o`/`i` = punctele de ieșire/intrare pe casete (fracții 0–1), `lp` = poziția etichetei pe săgeată (−1…1). Unele săgeți sunt intenționat duble, ca în desen.
  - Sursa structurii: schemele draw.io ale lui Serban, câte o pagină pe fază. Versiunea curentă e `harta/scheme/grafic.drawio`: fiecare casetă are, în Edit Data (Ctrl+M), proprietatea `etapa` (id-ul din `data.js`), plus `tip`, iar trimiterile portocalii au `duce_la` și un link spre pagina fazei. Casetele fără `etapa` sunt etape noi. Textele libere care încep cu „NOTĂ:” sunt observațiile lui Serban pentru implementare și nu apar pe grafic. Orice schimbare de structură se discută cu el; nu se corectează nimic fără acordul lui.
  - Când Serban trimite o schemă modificată, rulează întâi `python3 harta/scheme/verifica.py <fișier>` și trimite-i lista problemelor (săgeți nelipite sau neortogonale, casete fără cod, trimiteri fără țintă) înainte de implementare.
  - `PATHS` — traseele marcate. Fiecare pereche consecutivă de etape trebuie să existe ca muchie în `EDGES` sau să fie trecerea dintr-o etapă `faza` în etapa ei `go`.
  - `HOLIDAYS` — sărbătorile legale din 2026–2027, folosite de calculatorul de termene (art. 5 L101: ziua evenimentului nu se numără; termenul se prelungește dacă ultima zi e nelucrătoare).
- `harta/src/main.js` — graficul 2D. Fiecare fază se așază după pozițiile din schema lui Serban (`pos`, mărite cu `SX`/`SY` ca textul să încapă), iar fazele se stivuiesc vertical; săgețile sunt ortogonale, cu punctele de ieșire/intrare și punctele intermediare din draw.io. O fază fără `pos` se așază automat (dagre). Trimiterile portocalii (`faza`) duc, la clic, la etapa `go`. Deplasare: tragere sau derulare; zoom: Ctrl + rotița sau două degete. Dacă URL-ul are `#<id_etapă>`, graficul deschide direct acea etapă.
- `harta/src/page.html` — CSS-ul și markup-ul graficului. Culorile sunt tokens, cu temă deschisă și închisă; fiecare tip de etapă are `--c-*` (contur) și `--b-*` (fundal), în paleta din schemele lui Serban: violet = etapă, verde (hexagon) = întrebare, albastru = Da/Nu, gri = act al AC, galben simplu = acțiune / act procedural, galben mai închis în degrade (`--b-solutie` → `--b2-solutie`, `#g-solutie` în SVG) = soluție / situație, roșu = capcană, portocaliu = trimitere la altă fază.
- `harta/build.mjs` → `harta/out/harta.html` (pachet esbuild, inclus în pagină).
- `harta/build_ghid.mjs` → `harta/out/ghid.html`. Adaugă butoanele „Vezi pe hartă”, legând secțiunile ghidului de etapele hărții prin `ref`.
- `harta/build_site.mjs` → `harta/site/` (ghidul devine `index.html`, graficul `grafic.html`). Fonturile sunt găzduite local, din @fontsource, ca să nu se încarce nimic de pe Google (motiv GDPR). Tot aici se adaugă meta-tagurile, favicon-ul și pagina 404, imaginea de previzualizare `og.png` (sursa: `harta/src/og.html`), `robots.txt`, `sitemap.xml` și adresele canonice. Adresa absolută vine din variabila `URL`, pe care Netlify o dă la build; local lipsește, iar sitemap-ul nu se generează.
- `ghid/doc.xml` — exportul documentului Claude Docs al ghidului. `ghid/embeds/*.jsx` — diagramele lui (componente JSX).
- `ghid/convert.py` transformă `doc.xml` în `body.html` și `toc.json`. Trimiterile de tipul „(II.2.4)” devin automat legături. Paragrafele care încep cu „Atenție!” sau „Obs.” devin casete evidențiate.
- `ghid/render.mjs` transformă `embeds/*.jsx` în SVG static, salvat în `embeds.json`. Culorile `--cds-*` sunt mapate pe tokens în `ghid_tpl.html`.

## Comenzi
```
npm install
npm run embeds   # doar dacă s-au schimbat diagramele
npm run ghid     # doar dacă s-a schimbat doc.xml
npm run build    # construiește harta/site/
```
Verifică întotdeauna rezultatul înainte de commit: servește `harta/site` local (`python3 -m http.server`) și urmărește că nu apar erori în consolă, că merge trecerea Harta ↔ Ghidul și că funcționează legăturile „Vezi pe grafic” (`grafic.html#<etapă>`) și trimiterile din fișele graficului spre ghid (`./#II.x`).
Pentru `data.js`, validează: id-uri unice, muchii care trimit doar la etape existente, trasee fără goluri, nicio etapă izolată.

## Actualizarea textului ghidului
Sursa este documentul Claude Docs „Ghid practic — Litigiile în materia achizițiilor publice”, cu artifact și id doc `c01e1991-eb54-45aa-8698-5d2d79a89398`. Textul e în tabul „Ghid practic - Litigii achiziții publice”, nod `444e1ddb-0e24`. Ignoră celălalt tab.
- Dacă sesiunea are conectorul Claude Docs: citește nodul cu `read` și urmează paginarea (`payload {kind:'view', ...next, atRev}`) până când `complete` devine `true`. Lipește paginile în locul elementelor `<gap>` și salvează rezultatul în `ghid/doc.xml`. Diagramele sunt noduri referite prin `<embed ref='node/...'>`; citește-le codul (`value.code`) în `ghid/embeds/<id>.jsx`.
- Dacă nu are conectorul: cere-i lui Serban textul modificat sau un export al documentului.

## Convenții
- Ton sobru, juridic, exact. Disclaimerul („Material educativ, nu consultanță juridică…”) rămâne pe ambele pagini.
- Vizual: cele trei fonturi folosite sunt Source Serif 4 (titluri), IBM Plex Sans (text) și IBM Plex Mono (trimiteri). Accentul e albastru-cobalt. Paginile au temă deschisă și închisă și trebuie să meargă și pe telefon.
- Commit-urile se fac pe `main`; Netlify publică automat.

## Stadiu (3.10.2026)
Făcut:
- graficul 2D pentru Partea II refăcut integral după schemele draw.io ale lui Serban (131 de etape, 163 de legături, 8 faze, 6 trasee); Faza 4 începe cu etapa generală „Contestația la CNSC”, comună tuturor contestațiilor;
- calea judiciară (tribunal, recurs) a fost scoasă din hartă la cererea lui Serban: nu e de interes practic pentru un avocat la început de drum;
- pagina „Despre” (prezentarea lui Serban, data actualizării, contact); data actualizării se setează o singură dată, în `harta/src/site.js`;
- pagina Ghidul, completă (Părțile I–IV și anexele), cu cele 8 diagrame;
- legături în ambele sensuri între hartă și ghid;
- publicarea pe Netlify din GitHub.

De făcut sau de discutat cu Serban:
- harta pentru Partea III (executare, nulitate, despăgubiri, suspendare după semnare) și, eventual, traseele din Partea IV (scenariile CNAIR / Alfa–Beta);
- Serban trebuie să verifice: ramificările deduse („nimeni nu atacă decizia”, „contractul fusese deja semnat”); etichetele scurte;
- domeniul propriu, încă neales, legat la Netlify prin Domain management;
- Serban verifică fișele etapelor noi sau modificate (PDF „Fișele etapelor din grafic”) înainte de publicarea pe `main`;
- o eventuală variantă 3D, după ce toate fazele sunt corectate.
