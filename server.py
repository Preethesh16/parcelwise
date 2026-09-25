import argparse, json, math, os, sqlite3, uuid
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from contextlib import contextmanager

ROOT = Path(__file__).parent
DB = Path(os.environ.get('PARCELWISE_DB', ROOT / 'data.sqlite3'))
CITIES = {'Mumbai': [19.07,72.87], 'Delhi': [28.61,77.21], 'Bengaluru': [12.97,77.59], 'Hyderabad': [17.38,78.49], 'Chennai': [13.08,80.27], 'Pune': [18.52,73.85], 'Kolkata': [22.57,88.36], 'Jaipur': [26.91,75.79]}
PARTNERS = [dict(id='A', name='Partner A', label='Everyday value', base=58, rate=22, days=4, ontime=.92, success=.98, quality=.88, maxweight=25),dict(id='B',name='Partner B',label='Express specialist',base=90,rate=30,days=2,ontime=.96,success=.99,quality=.93,maxweight=15),dict(id='C',name='Partner C',label='Care in every mile',base=76,rate=26,days=3,ontime=.98,success=.995,quality=.97,maxweight=30)]
STAGES = ['Booked','Picked up','In transit','Out for delivery','Delivered']

@contextmanager
def connect():
    db=sqlite3.connect(DB); db.row_factory=sqlite3.Row
    try:
        with db: yield db
    finally: db.close()

def init():
    with connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS shipments (id TEXT PRIMARY KEY, data TEXT NOT NULL, stage INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL, feedback TEXT)')

def validate(data):
    if data.get('origin') not in CITIES or data.get('destination') not in CITIES: raise ValueError('Choose a supported origin and destination.')
    clean={k:data[k] for k in ['origin','destination']}
    for key, cap in [('weight',100),('length',200),('width',200),('height',200)]:
        try: v=float(data.get(key,0))
        except (TypeError,ValueError): raise ValueError('Parcel measurements must be numbers.')
        if not math.isfinite(v) or not 0<v<=cap: raise ValueError(f'{key.title()} must be greater than 0 and at most {cap}.')
        clean[key]=v
    clean['priority']=data.get('priority','balanced')
    if clean['priority'] not in ['balanced','price','speed','reliability']: raise ValueError('Unknown ranking priority.')
    return clean

def quotes(data):
    d=validate(data); a,b=CITIES[d['origin']],CITIES[d['destination']]
    distance=round(math.hypot((a[0]-b[0])*111,(a[1]-b[1])*103))
    weight=max(d['weight'],d['length']*d['width']*d['height']/5000)
    eligible=[]; excluded=[]
    with connect() as db: rows=db.execute('SELECT data, feedback FROM shipments WHERE feedback IS NOT NULL').fetchall()
    for p in PARTNERS:
        reason=None
        if weight>p['maxweight']: reason=f"Billable weight exceeds {p['maxweight']} kg limit"
        if p['id']=='B' and 'Jaipur' in (d['origin'],d['destination']): reason='Express service is unavailable on this route'
        if p['id']=='C' and 'Kolkata' in (d['origin'],d['destination']): reason='Service is unavailable on this route'
        if reason: excluded.append(dict(id=p['id'],name=p['name'],reason=reason)); continue
        same=[]; other=[]
        for row in rows:
            s=json.loads(row['data']); f=json.loads(row['feedback'])
            if s['partner']['id']==p['id']:
                (same if (s['origin'],s['destination'])==(d['origin'],d['destination']) else other).append(f)
        # 40 equivalent historical deliveries. Exact-route feedback has full weight;
        # other routes have 0.2 weight. Larger histories naturally increase confidence.
        n=40+len(same)+.2*len(other)
        def estimate(key, prior): return (40*prior+sum(f[key] for f in same)+.2*sum(f[key] for f in other))/n
        ontime=estimate('ontime',p['ontime']); success=estimate('success',p['success']); quality=estimate('quality',p['quality'])
        reliability=.6*ontime+.4*success
        base=round(p['base']+p['rate']*math.ceil(weight)+distance*.045)
        discount=round(base*(.15 if p['id']=='A' and weight<=5 else .1 if p['id']=='C' and distance>800 else 0))
        days=max(1,p['days']-(1 if distance<500 else 0)+(1 if distance>1700 else 0))
        eligible.append(dict(p,price=base-discount,original=base,discount=discount,days=days,ontime=ontime,success=success,quality=quality,reliability=reliability,routeReviews=len(same),allReviews=len(same)+len(other)))
    weights={'balanced':[.35,.25,.25,.15],'price':[.8,.1,.05,.05],'speed':[.15,.65,.1,.1],'reliability':[.1,.1,.55,.25]}[d['priority']]
    for q in eligible:
        # Fixed 0–1 scales: value utility, speed utility, measured reliability, quality.
        components=[1/(1+q['price']/250),max(0,1-(q['days']-1)/6),q['reliability'],q['quality']]
        q['score']=round(100*sum(x*w for x,w in zip(components,weights)),1)
        q['components']=[round(x*100,1) for x in components]
    eligible.sort(key=lambda p:(-p['score'],p['price']))
    return dict(shipment=d,partners=eligible,excluded=excluded,billableWeight=round(weight,2),distance=distance,weights=weights)

def shipments():
    with connect() as db: rows=db.execute('SELECT * FROM shipments ORDER BY created DESC').fetchall()
    return [dict(id=r['id'],**json.loads(r['data']),stage=r['stage'],status=STAGES[r['stage']],created=r['created'],feedback=json.loads(r['feedback']) if r['feedback'] else None) for r in rows]

class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs): super().__init__(*args,directory=str(ROOT/'static'),**kwargs)
    def respond(self,data,status=200):
        body=json.dumps(data).encode(); self.send_response(status); self.send_header('Content-Type','application/json'); self.send_header('Content-Length',str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        if self.path=='/api/meta': return self.respond(dict(cities=list(CITIES),stages=STAGES))
        if self.path=='/api/shipments': return self.respond(shipments())
        return super().do_GET()
    def do_POST(self):
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size>10000: raise ValueError('Request too large.')
            d=json.loads(self.rfile.read(size))
            if not isinstance(d,dict): raise ValueError('Expected a JSON object.')
            if self.path=='/api/quotes': return self.respond(quotes(d))
            if self.path=='/api/shipments':
                result=quotes(d); partner=next((p for p in result['partners'] if p['id']==d.get('partner')),None)
                if partner is None: raise ValueError('This partner is not eligible for the shipment.')
                s=dict(**result['shipment'],partner=partner); sid='PW-'+uuid.uuid4().hex[:8].upper()
                with connect() as db: db.execute('INSERT INTO shipments(id,data,created) VALUES(?,?,?)',(sid,json.dumps(s),datetime.now(timezone.utc).isoformat()))
                return self.respond(dict(id=sid),201)
            if self.path in ['/api/advance','/api/feedback']:
                with connect() as db:
                    db.execute('BEGIN IMMEDIATE')
                    row=db.execute('SELECT * FROM shipments WHERE id=?',(d.get('id'),)).fetchone()
                    if row is None: return self.respond(dict(error='Shipment not found.'),404)
                    if self.path=='/api/advance': db.execute('UPDATE shipments SET stage=MIN(stage+1,4) WHERE id=?',(d['id'],))
                    else:
                        if row['stage']!=4: raise ValueError('Feedback is available after delivery.')
                        if row['feedback']: raise ValueError('Feedback has already been submitted for this shipment.')
                        if type(d.get('rating')) is not int or not 1<=d['rating']<=5 or type(d.get('ontime')) is not bool or type(d.get('success')) is not bool: raise ValueError('Provide a rating and delivery outcomes.')
                        f=dict(rating=d['rating'],quality=(d['rating']-1)/4,ontime=int(d['ontime']),success=int(d['success']))
                        db.execute('UPDATE shipments SET feedback=? WHERE id=?',(json.dumps(f),d['id']))
                return self.respond(dict(ok=True))
            self.respond(dict(error='Unknown endpoint.'),404)
        except (ValueError,TypeError,KeyError) as e: self.respond(dict(error=str(e)),400)

if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--port',type=int,default=8000); args=parser.parse_args(); init()
    print(f'Parcelwise running at http://localhost:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
