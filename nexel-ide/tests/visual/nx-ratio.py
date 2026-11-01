import json, sys
import numpy as np
from PIL import Image

shot_path, boxes_path, viewport_w = sys.argv[1], sys.argv[2], int(sys.argv[3])
img = np.asarray(Image.open(shot_path).convert('RGB')).astype(float)
boxes = json.load(open(boxes_path))
shot = sys.argv[4]
bb = boxes[shot]
scale = img.shape[1] / viewport_w

def crop(b):
    x0, y0 = int(b['x']*scale), int(b['y']*scale)
    x1, y1 = int((b['x']+b['width'])*scale), int((b['y']+b['height'])*scale)
    x0, y0 = max(0,x0), max(0,y0)
    x1, y1 = min(img.shape[1],x1), min(img.shape[0],y1)
    if x1<=x0 or y1<=y0: return None
    return img[y0:y1, x0:x1].reshape(-1,3)

def lum(c):
    c = c/255.0
    c = np.where(c<=0.03928, c/12.92, ((c+0.055)/1.055)**2.4)
    return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2]

def dominant(px, q=24.0):
    qb = (px//q).astype(int)
    keys = qb[:,0]*1000000 + qb[:,1]*1000 + qb[:,2]
    vals, counts = np.unique(keys, return_counts=True)
    order = np.argsort(-counts)
    out = []
    for i in order:
        mask = keys == vals[i]
        out.append((vals[i], counts[i], px[mask].mean(axis=0)))
    return out

def text_bg(textbox, bgbox=None, mode='vs-container'):
    tpx = crop(textbox)
    if tpx is None or len(tpx)<4: return None
    if mode == 'two-cluster' or bgbox is None:
        doms = dominant(tpx)
        if len(doms)<2: return None
        bg_c, txt_c = doms[0][2], doms[1][2]
    else:
        bpx = crop(bgbox)
        if bpx is None or len(bpx)<4: return None
        bg_c = dominant(bpx)[0][2]
        bg_l = lum(bg_c)
        doms = dominant(tpx)
        cands = [(abs(lum(d[2])-bg_l), d[2]) for d in doms if abs(lum(d[2])-bg_l) > 0.02]
        txt_c = max(cands)[1] if cands else (doms[1][2] if len(doms)>1 else None)
        if txt_c is None: return None
    l1, l2 = lum(txt_c), lum(bg_c)
    hi, lo = max(l1,l2), min(l1,l2)
    return (hi+0.05)/(lo+0.05), txt_c.astype(int).tolist(), bg_c.astype(int).tolist()

targets = {
 'p3': [('passed.active name','pill_name','pill','vs-container'),
        ('passed.active badge','pill_badge','pill_badge_bg','vs-container')],
 'p4': [('failed.active name','pill_name','pill','vs-container'),
        ('failed.active badge','pill_badge','pill_badge_bg','vs-container'),
        ('passed idle badge','pill_passed_badge','pill_badge_bg','vs-container')],
 'p2': [('contest #id','contest_id','contest_card','vs-container'),
        ('contest duration','contest_duration','contest_card','vs-container'),
        ('contest date','contest_date','contest_card','vs-container'),
        ('import button','import_btn','import_btn','vs-container')],
 'p5': [('light failed.active name','pill_name','pill','vs-container'),
        ('light failed.active badge','pill_badge','pill','vs-container'),
        ('light passed idle badge','pill_passed_badge','pill_passed','vs-container')],
 'p6': [('light passed.active name','pill_name','pill','vs-container'),
        ('light passed.active badge','pill_badge','pill','vs-container'),
        ('light actual-area text','actual_area','actual_area','vs-container')],
 'p7': [('light diff hdr green','hdr_green','hdr_green','vs-container'),
        ('light diff hdr red','hdr_red','hdr_red','vs-container'),
        ('light diff expected text','exp_cell','exp_cell','vs-container'),
        ('light diff actual text','act_cell','act_cell','vs-container')],
 'p0': [('explorer ext','explorer_ext',None,'two-cluster')],
 's1': [('ring pct text','ring_txt','ring','vs-container'),
        ('heading sub','heading_sub','field_input','vs-container'),
        ('field label','field_label','field_input','vs-container'),
        ('field input text','field_input','field_input','vs-container'),
        ('start button','start_btn','start_btn','vs-container')],
 's2': [('running pct','ring_txt','ring','vs-container'),
        ('stop button','stop_btn','stop_btn','vs-container')],
 's2b': [],
 's4': [('pass ring text','ring_txt','heading_sub','vs-container')],
 's3': [('fail chip','fail_chip','fail_chip','vs-container'),
        ('fail pre','fail_pre','fail_pre','vs-container'),
        ('fail diff brute','fail_diff_a','fail_diff_a','vs-container'),
        ('fail diff yours','fail_diff_b','fail_diff_b','vs-container'),
        ('save button','save_btn','save_btn','vs-container')],
}
for name, tkey, bkey, mode in targets.get(shot, []):
    tb = bb.get(tkey); bgbox = bb.get(bkey) if bkey else None
    if not tb:
        print(f'{shot} {name}: BOX MISSING ({tkey})'); continue
    r = text_bg(tb, bgbox, mode)
    if r: print(f'{shot} {name}: ratio {r[0]:.2f}:1  text{tuple(r[1])} bg{tuple(r[2])}')
