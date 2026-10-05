# Graficul litigiilor în materia achizițiilor publice

Note de predare pentru sesiunile Claude care lucrează în acest repository.
Proprietar: Serban, avocat litigant (Managing Associate). Toată comunicarea și conținutul site-ului sunt în limba română.

## Ce este
Site static, gratuit, fără cont, publicat pe Netlify din acest repository (`netlify.toml`: `npm run build`, publică `harta/site`). Are trei pagini, în ordinea din bara de sus: Ghidul, Graficul, Despre.
- **Ghidul** (`index.html`, pagina principală; adresa veche `ghid.html` e redirecționată spre „/” în `netlify.toml`): ghidul practic complet al lui Serban, cu cuprins în bara laterală. Dacă adresa are un fragment care e id de etapă (`/#d_doc`, din linkurile vechi spre grafic), pagina trimite automat la `grafic.html#d_doc`.
- **Graficul** (`grafic.html`; în cod și în numele fișierelor se numește încă „harta”): un grafic 3D (Three.js) cu toate deciziile posibile în litigiile de achiziții publice de până la încheierea contractului, adică Partea II a ghidului. Nu e un joc, ci o reprezentare a ramificațiilor. Pe site se spune „graficul”, nu „harta”; excepție face diagrama „Harta căilor de atac” din textul ghidului.
- **Despre** (`despre.html`): prezentarea lui Serban, data actualizării, contact.

Conținutul provine EXCLUSIV din ghidul lui Serban. Nu adăuga reguli juridice din memorie. Orice text nou se citează la secțiunea din ghid și la articol.

## Structura
- `harta/src/data.js` — sursa de adevăr pentru hartă:
  - `NODES` — etapele. Câmpuri: `id`, `type` (moment, decizie, remediu, solutie, risc, link), `lvl` (0 procedura, 1 CNSC, 2 curtea de apel, 3 căi extraordinare), `tr` (pista: contract, cnsc), `col` (poziția pe axa timpului), `dz` (decalaj pe adâncime), `roles` (ofertant, castigator, ac), `t` (titlu), `s` (eticheta scurtă), `sum`, `f` (perechi [etichetă, text]), `warn`, `calc` (`{zile:[peste,sub], de:'...'}` pentru calculatorul de termene), `ref` (secțiunile din ghid), `art`.
  - `EDGES` — legăturile, ca `[from, to, eticheta, kind, eticheta_scurtă?]`, cu kind: flow, choice, risk, loop, out. Eticheta scurtă (opțională) apare pe hartă; fișa etapei arată eticheta completă.
  - `PATHS` — traseele marcate. Fiecare pereche consecutivă de etape trebuie să existe și ca muchie în `EDGES`.
  - `HOLIDAYS` — sărbătorile legale din 2026–2027, folosite de calculatorul de termene (art. 5 L101: ziua evenimentului nu se numără; termenul se prelungește dacă ultima zi e nelucrătoare).
- `harta/src/main.js` — scena 3D. Constantele de spațiere sunt `SX`, `LY`, `ZS`, `RISK_DY`. Etichetele care se suprapun pe ecran sunt ascunse după prioritate. Dacă URL-ul are `#<id_etapă>`, harta deschide direct acea etapă.
- `harta/src/page.html` — CSS-ul și markup-ul hărții. Culorile sunt definite ca tokens, cu temă deschisă și închisă.
- `harta/build.mjs` → `harta/out/harta.html` (pachet esbuild, inclus în pagină).
- `harta/build_ghid.mjs` → `harta/out/ghid.html`. Adaugă butoanele „Vezi pe hartă”, legând secțiunile ghidului de etapele hărții prin `ref`.
- `harta/build_site.mjs` → `harta/site/` (ghidul devine `index.html`, graficul `grafic.html`). Fonturile sunt găzduite local, din @fontsource, ca să nu se încarce nimic de pe Google (motiv GDPR). Tot aici se adaugă meta-tagurile, favicon-ul și pagina 404.
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
- harta pentru Partea II (61 de etape, 106 legături, 6 trasee, calculator de termene, filtru după rol, vedere listă), inclusiv ramura solicitării de clarificări privind documentația și ramura solicitării de clarificări din evaluare (art. 209 L98; IV.3);
- calea judiciară (tribunal, recurs) a fost scoasă din hartă la cererea lui Serban: nu e de interes practic pentru un avocat la început de drum;
- pagina „Despre” (prezentarea lui Serban, data actualizării, contact); data actualizării se setează o singură dată, în `harta/src/site.js`;
- pagina Ghidul, completă (Părțile I–IV și anexele), cu cele 8 diagrame;
- legături în ambele sensuri între hartă și ghid;
- publicarea pe Netlify din GitHub.

De făcut sau de discutat cu Serban:
- harta pentru Partea III (executare, nulitate, despăgubiri, suspendare după semnare) și, eventual, traseele din Partea IV (scenariile CNAIR / Alfa–Beta);
- Serban trebuie să verifice: ramificările deduse („nimeni nu atacă decizia”, „contractul fusese deja semnat”); etichetele scurte;
- domeniul propriu, încă neales, legat la Netlify prin Domain management;
- o îmbunătățire minoră: etichetele de pe muchii se pot suprapune când o etapă are multe ieșiri.
