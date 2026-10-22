# Verifică o schemă draw.io a graficului înainte de implementare:
#   python3 harta/scheme/verifica.py harta/scheme/grafic.drawio
# Raportează săgețile nelipite de casete, săgețile neortogonale, casetele fără cod de etapă (noi),
# codurile duplicate, trimiterile portocalii fără țintă și notele „NOTĂ:” lăsate pentru implementare.
import sys, re, zlib, base64, urllib.parse
import xml.etree.ElementTree as ET

def model_of(dg):
    m = dg.find('mxGraphModel')
    if m is None:
        m = ET.fromstring(urllib.parse.unquote(zlib.decompress(base64.b64decode(dg.text.strip()), -15).decode()))
    return m

def clean(v):
    v = re.sub(r'<br\s*/?>|</div>|</p>', ' ', v or '', flags=re.I)
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', v)).replace('&nbsp;', ' ').strip()

root = ET.parse(sys.argv[1]).getroot()
seen, total = {}, 0
for dg in root.findall('diagram'):
    page = dg.get('name'); probs = []
    boxes, notes = {}, []
    for el in model_of(dg).find('root'):
        c, attrs = (el.find('mxCell'), el.attrib) if el.tag in ('UserObject', 'object') else (el, {})
        cid = attrs.get('id') or c.get('id'); label = clean(attrs.get('label', c.get('value')))
        st = c.get('style') or ''
        if c.get('vertex') == '1' and 'edgeLabel' not in st:
            if label.upper().startswith('NOTĂ'): notes.append(label); continue
            if st.startswith('text;'): continue
            boxes[cid] = label
            code = attrs.get('etapa')
            if not code: probs.append(f'casetă fără cod (nouă?): „{label}”')
            elif code in seen: probs.append(f'cod duplicat {code}: „{label}” (și în {seen[code]})')
            else: seen[code] = page
            if 'ffe6cc' in st.lower() and not (attrs.get('duce_la') or attrs.get('link')):
                probs.append(f'trimitere fără țintă (duce_la sau link): „{label}”')
    for el in model_of(dg).iter('mxCell'):
        if el.get('edge') != '1': continue
        lab = clean(el.get('value'))
        name = f'săgeata „{lab}”' if lab else 'o săgeată'
        s, t = boxes.get(el.get('source')), boxes.get(el.get('target'))
        if s is None and t is None: probs.append(f'{name}: nelipită la niciun capăt')
        elif s is None: probs.append(f'{name} spre „{t}”: nelipită la plecare')
        elif t is None: probs.append(f'{name} din „{s}”: nelipită la sosire')
        if 'orthogonalEdgeStyle' not in (el.get('style') or ''): probs.append(f'{name} ({s or "?"} → {t or "?"}): nu e ortogonală')
    print(f'\n=== {page}: {len(boxes)} casete')
    for p in probs: print('  -', p)
    for n in notes: print('  · ', n)
    if not probs: print('  OK')
    total += len(probs)
print(f'\n{total} probleme')
