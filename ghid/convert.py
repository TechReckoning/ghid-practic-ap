import re, json, html
import xml.etree.ElementTree as ET

SESS = 'mvngdhqdap6'
root = ET.fromstring(open('doc.xml', encoding='utf-8').read())
EMB = json.load(open('embeds.json', encoding='utf-8'))

def full(i):
    return SESS + i if i and i.startswith('.') else i

def esc(s):
    return html.escape(s or '', quote=False)

# ── pass 1: heading ids
heads = []          # (level, text, id, blockid)
blockid_to_anchor = {}
used = set()
def make_id(text):
    m = re.match(r'^((?:IV|III|II|I)(?:\.\d+)+)\b', text)
    if m: return m.group(1)
    m = re.match(r'^Partea (IV|III|II|I)\b', text)
    if m: return 'partea-' + m.group(1)
    m = re.match(r'^Anexa (\d+)', text)
    if m: return 'anexa-' + m.group(1)
    s = text.lower()
    for a, b in zip('ăâîșțşţ', 'aaiştst'): s = s.replace(a, b)
    s = re.sub(r'[^a-z0-9]+', '-', s).strip('-')
    return s[:40] or 'sec'

for el in root.iter('paragraph'):
    lv = el.get('heading')
    if not lv: continue
    t = ''.join(el.itertext()).strip()
    hid = make_id(t)
    while hid in used: hid += '-x'
    used.add(hid)
    heads.append((int(lv), t, hid, full(el.get('id'))))
    blockid_to_anchor[full(el.get('id'))] = hid

link_targets = set()
for a in root.iter('link'):
    h = a.get('href', '')
    if h.startswith('#'): link_targets.add(h[1:])
for t in link_targets:
    if t not in blockid_to_anchor:
        blockid_to_anchor[t] = 'b-' + t.split('.')[-1]

ids_all = set(blockid_to_anchor.values())
SEC_RE = re.compile(r'(?<![\w.])((?:IV|III|II|I)\.\d+(?:\.\d+){0,2})(?![\w])')

def autolink(s):
    out, last = [], 0
    for m in SEC_RE.finditer(s):
        ref = m.group(1)
        if ref in ids_all:
            out.append(esc(s[last:m.start()]))
            out.append(f'<a class="xref" href="#{ref}">{esc(ref)}</a>')
            last = m.end()
    out.append(esc(s[last:]))
    return ''.join(out)

def inline(el, in_link=False):
    tag = el.tag
    inner = (esc(el.text) if in_link or tag == 'link' else autolink(el.text or ''))
    for c in el:
        inner += inline(c, in_link or tag == 'link')
        inner += esc(c.tail) if (in_link or tag == 'link') else autolink(c.tail or '')
    if tag == 'bold': return f'<strong>{inner}</strong>'
    if tag == 'italic': return f'<em>{inner}</em>'
    if tag == 'underline': return f'<u>{inner}</u>'
    if tag == 'link':
        h = el.get('href', '')
        if h.startswith('#'):
            return f'<a href="#{blockid_to_anchor.get(h[1:], "")}">{inner}</a>'
        return f'<a href="{html.escape(h)}" target="_blank" rel="noopener">{inner}</a>'
    if tag == 'date':
        y, m, d = el.get('value').split('-')
        return f'{int(d)}.{m}.{y}'
    if tag == 'mention':
        return esc(el.get('name'))
    return inner

def para_inline(p):
    return ''.join(inline(c) for c in p)

def attr_id(el):
    b = full(el.get('id'))
    a = blockid_to_anchor.get(b)
    return f' id="{a}"' if a else ''

skip_toc = {'on': False}
def block(el, depth=0):
    tag = el.tag
    if tag == 'paragraph':
        lv = el.get('heading')
        txt = ''.join(inline(c, True) for c in el) if lv else para_inline(el)
        if lv:
            n = int(lv)
            if n == 1: return ''
            if ''.join(el.itertext()).strip() == 'Cuprins':
                skip_toc['on'] = True
                return ''
            skip_toc['on'] = False
            hid = blockid_to_anchor[full(el.get('id'))]
            cls = ' class="part"' if n == 2 else ''
            return f'<h{n} id="{hid}"{cls}>{txt}</h{n}>'
        plain = ''.join(el.itertext()).strip()
        if not plain or el.find('date') is not None or el.find('mention') is not None: return ''
        cls = ''
        first = el[0] if len(el) else None
        lead = first[0] if first is not None and len(first) and first[0].tag == 'bold' and not (first.text or '').strip() else None
        if lead is not None:
            lt = ''.join(lead.itertext()).strip()
            if lt.startswith('Atenție'): cls = ' class="callout warn"'
            elif lt.startswith('Obs'): cls = ' class="callout note"'
        return f'<p{attr_id(el)}{cls}>{txt}</p>'
    if skip_toc['on'] and depth == 0 and tag == 'list':
        return ''
    if tag == 'list':
        t = 'ol' if el.get('kind') == 'ordered' else 'ul'
        return f'<{t}{attr_id(el)}>' + ''.join(block(c, depth + 1) for c in el) + f'</{t}>'
    if tag == 'listItem':
        return f'<li{attr_id(el)}>' + ''.join(block(c, depth + 1) for c in el) + '</li>'
    if tag == 'blockquote':
        return '<blockquote>' + ''.join(block(c, depth + 1) for c in el) + '</blockquote>'
    if tag == 'table':
        rows = []
        for i, r in enumerate(el):
            cells = []
            for c in r:
                th = c.get('header') == 'true'
                inner = ''.join(block(x, depth + 1) for x in c)
                cells.append(f'<{"th" if th else "td"}>{inner}</{"th" if th else "td"}>')
            rows.append('<tr>' + ''.join(cells) + '</tr>')
        return f'<div class="tw"{attr_id(el)}><table>' + ''.join(rows) + '</table></div>'
    if tag == 'embed':
        ref = el.get('ref', '').split('/')[-1]
        svg = EMB.get(ref, '')
        cap = esc(el.get('caption'))
        return f'<figure class="fig"{attr_id(el)}><div class="fig-svg">{svg}</div><figcaption>{cap}</figcaption></figure>'
    return ''

body = ''.join(block(c) for c in root)
# simplify single-paragraph cells / list items: <li><p>..</p></li> → keep p for spacing control via CSS

# ── TOC tree
toc = [h for h in heads if h[0] >= 2 and h[1] != 'Cuprins']
json.dump([{'lv': h[0], 't': h[1], 'id': h[2]} for h in toc], open('toc.json', 'w', encoding='utf-8'), ensure_ascii=False)
open('body.html', 'w', encoding='utf-8').write(body)
print(len(body), len(toc), 'xrefs', body.count('class="xref"'))
