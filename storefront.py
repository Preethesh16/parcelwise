"""Independent Everyday storefront; confirmed orders leave through HTTP only."""
import argparse, json, os, sqlite3, urllib.request, urllib.error
from pathlib import Path
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from workflow import PRODUCTS, address, integer, canonical, digest
ROOT=Path(__file__).parent
DB=Path(os.environ.get('EVERYDAY_DB',ROOT/'store.sqlite3'))
API=os.environ.get('PARCELWISE_API_URL','http://127.0.0.1:8001')
PUBLIC=os.environ.get('PARCELWISE_PUBLIC_URL','http://localhost:8001')
KEY=os.environ.get('PARCELWISE_COMPANY_KEY','demo-company-key')
CITIES=['Mumbai','Delhi','Bengaluru','Hyderabad','Chennai','Pune','Kolkata','Jaipur']
WAREHOUSE=dict(line1='18 Market Road, Andheri',city='Mumbai',postalCode='400058')
def init():
    with sqlite3.connect(DB) as db:db.execute('CREATE TABLE IF NOT EXISTS checkouts (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, payload TEXT NOT NULL, result TEXT)')
def checkout(data):
    request_id=data.get('requestId')
    if not isinstance(request_id,str) or not 8<=len(request_id)<=100:raise ValueError('A checkout request ID is required.')
    fingerprint=digest(canonical(data))
    with sqlite3.connect(DB) as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT fingerprint,payload,result FROM checkouts WHERE id=?',(request_id,)).fetchone()
        if row:
            if row[0]!=fingerprint:raise ValueError('This checkout ID already belongs to a different order.')
            if row[2]:return json.loads(row[2])
            payload=json.loads(row[1])
        else:
            product=next((p for p in PRODUCTS if p['id']==data.get('productId')),None)
            if product is None:raise ValueError('Choose a product.')
            qty=integer(data.get('quantity'),1,5,'Quantity');name=str(data.get('customerName','')).strip()
            if not 2<=len(name)<=70:raise ValueError('Enter the recipient name.')
            destination=address(data.get('address'),CITIES)
            payload=dict(orderId='EVERYDAY-'+request_id,status='confirmed',seller=dict(name='Everyday Store',address=WAREHOUSE),customer=dict(name=name,address=destination),items=[dict(sku=product['id'],name=product['name'],quantity=qty,unitPrice=product['price'],weightKg=product['weight'],dimensionsCm={k:product[k] for k in ['length','width','height']})])
            db.execute('INSERT INTO checkouts VALUES(?,?,?,NULL)',(request_id,fingerprint,canonical(payload)))
    request=urllib.request.Request(API+'/api/v1/orders',data=canonical(payload).encode(),headers={'Content-Type':'application/json','X-API-Key':KEY})
    try:
        with urllib.request.urlopen(request,timeout=8) as response:result=json.load(response)
    except (urllib.error.URLError,TimeoutError) as error:
        raise ConnectionError('Your order is confirmed, but Parcelwise is temporarily unavailable. Retry this checkout to dispatch the same order safely.') from error
    result['redirectUrl']=PUBLIC+'/#order='+result['id']
    with sqlite3.connect(DB) as db:db.execute('UPDATE checkouts SET result=? WHERE id=?',(canonical(result),request_id))
    return result
class Handler(SimpleHTTPRequestHandler):
    def __init__(self,*args,**kwargs):super().__init__(*args,directory=str(ROOT/'storefront'),**kwargs)
    def respond(self,data,status=200):
        body=json.dumps(data).encode();self.send_response(status);self.send_header('Content-Type','application/json');self.send_header('Cache-Control','no-store');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
    def do_GET(self):
        if self.path=='/api/catalog':return self.respond(dict(products=PRODUCTS,cities=CITIES))
        if self.path=='/api/config':return self.respond(dict(parcelwiseUrl=PUBLIC))
        return super().do_GET()
    def do_POST(self):
        if self.path!='/api/checkout':return self.respond(dict(error='Unknown endpoint'),404)
        try:
            size=int(self.headers.get('Content-Length',0))
            if not 0<size<=30000:raise ValueError('Invalid request size.')
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict):raise ValueError('Expected an object.')
            return self.respond(checkout(data),201)
        except (ValueError,TypeError,KeyError) as error:self.respond(dict(error=str(error)),400)
        except ConnectionError as error:self.respond(dict(error=str(error),confirmed=True),503)
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8000);args=parser.parse_args();init()
    print(f'Everyday running at http://localhost:{args.port}',flush=True)
    ThreadingHTTPServer(('127.0.0.1',args.port),Handler).serve_forever()
