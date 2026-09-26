"""Local simulation: order ingestion, policy agents, and atomic escrow accounting.
No carrier calls, LLM calls, blockchain transactions, or real money movement occur.
"""
import hashlib
import hmac
import json
import math
import secrets
import uuid
from datetime import datetime, timedelta, timezone

PRODUCTS = [
    dict(id='bag', name='The Weekender', category='EVERYDAY CARRY', price=249900, weight=1.2, length=35, width=25, height=12, color='sage', description='One bag. Every little adventure.'),
    dict(id='bottle', name='Daybreak Bottle', category='DAILY ESSENTIALS', price=89900, weight=.6, length=28, width=10, height=10, color='peach', description='A little refresh for your routine.'),
    dict(id='lamp', name='Evening Light', category='A QUIETER HOME', price=149900, weight=1.8, length=30, width=25, height=25, color='lavender', description='Make a little room for warm light.')
]
DEFAULT_COMPANY = dict(name='Everyday Store', address=dict(line1='18 Market Road, Andheri',city='Mumbai',postalCode='400058'), priority='balanced', maxShipping=25000, maxDays=5)
DEFAULT_PARTNERS = [
    dict(id='A',name='Partner A',tag='Value delivery',enabled=True,deliveryDays=4,minPrice=6500,maxDiscount=15,maxWeight=25,excludedCities=[],wallet='partner:A'),
    dict(id='B',name='Partner B',tag='Express delivery',enabled=True,deliveryDays=2,minPrice=11000,maxDiscount=10,maxWeight=15,excludedCities=['Jaipur'],wallet='partner:B'),
    dict(id='C',name='Partner C',tag='Care-first delivery',enabled=True,deliveryDays=3,minPrice=9000,maxDiscount=12,maxWeight=30,excludedCities=['Kolkata'],wallet='partner:C')
]

def now(): return datetime.now(timezone.utc).isoformat()
def canonical(data): return json.dumps(data,sort_keys=True,separators=(',',':'))
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def integer(value, low, high, name):
    if type(value) is not int or not low <= value <= high: raise ValueError(f'{name} must be an integer between {low} and {high}.')
    return value

def address(data,cities):
    if not isinstance(data,dict): raise ValueError('Provide a structured address.')
    line=str(data.get('line1','')).strip(); city=data.get('city'); pin=str(data.get('postalCode',''))
    if not 5<=len(line)<=180 or city not in cities or not (len(pin)==6 and pin.isascii() and pin.isdigit()):
        raise ValueError('Address needs a street, supported city, and six-digit PIN code.')
    return dict(line1=line,city=city,postalCode=pin)

class Workflow:
    def __init__(self, connect, quote_engine, cities):
        self.connect,self.quote_engine,self.cities=connect,quote_engine,cities
    def init(self):
        with self.connect() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS settings (id TEXT PRIMARY KEY, data TEXT NOT NULL, key_hash TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, external_id TEXT UNIQUE NOT NULL, payload_hash TEXT NOT NULL, data TEXT NOT NULL, token TEXT UNIQUE NOT NULL, created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS wallets (id TEXT PRIMARY KEY, balance INTEGER NOT NULL CHECK(balance>=0));
            CREATE TABLE IF NOT EXISTS ledger (id TEXT PRIMARY KEY, order_id TEXT NOT NULL, action TEXT NOT NULL, sender TEXT NOT NULL, receiver TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount>0), created TEXT NOT NULL, UNIQUE(order_id,action));
            ''')
            db.execute('INSERT OR IGNORE INTO settings VALUES(?,?,?)',('company',canonical(DEFAULT_COMPANY),digest('demo-company-key')))
            db.execute('INSERT OR IGNORE INTO wallets VALUES(?,?)',('company',1000000))
            db.execute('INSERT OR IGNORE INTO wallets VALUES(?,?)',('escrow',0))
            for p in DEFAULT_PARTNERS:
                db.execute('INSERT OR IGNORE INTO settings VALUES(?,?,?)',('partner:'+p['id'],canonical(p),digest('demo-partner-'+p['id']+'-key')))
                db.execute('INSERT OR IGNORE INTO wallets VALUES(?,?)',(p['wallet'],0))
                saved=json.loads(db.execute('SELECT data FROM settings WHERE id=?',('partner:'+p['id'],)).fetchone()['data'])
                if 'deliveryDays' not in saved:
                    saved['deliveryDays']=p['deliveryDays']
                    db.execute('UPDATE settings SET data=? WHERE id=?',(canonical(saved),'partner:'+p['id']))
    def configuration(self, db=None):
        if db is None:
            with self.connect() as db: return self.configuration(db)
        rows={r['id']:json.loads(r['data']) for r in db.execute('SELECT * FROM settings')}
        return dict(company=rows['company'],partners=[rows['partner:'+p['id']] for p in DEFAULT_PARTNERS])
    def authorized(self, identity, key):
        if not isinstance(key,str) or not key: return False
        with self.connect() as db: row=db.execute('SELECT key_hash FROM settings WHERE id=?',(identity,)).fetchone()
        return bool(row and hmac.compare_digest(row['key_hash'],digest(key)))
    def save_config(self, data):
        identity=data.get('id'); cfg=data.get('config')
        if not isinstance(cfg,dict): raise ValueError('Configuration is required.')
        key=data.get('apiKey','')
        if key and (not isinstance(key,str) or not 16<=len(key)<=200): raise ValueError('Use a sandbox API key of 16–200 characters.')
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            old=db.execute('SELECT * FROM settings WHERE id=?',(identity,)).fetchone()
            if old is None: raise ValueError('Unknown connection.')
            current=json.loads(old['data'])
            if identity=='company':
                name=str(cfg.get('name','')).strip()
                if not 2<=len(name)<=60: raise ValueError('Company name must contain 2–60 characters.')
                if cfg.get('priority') not in ['balanced','price','speed','reliability']: raise ValueError('Choose a shipping priority.')
                current.update(name=name,address=address(cfg.get('address'),self.cities),priority=cfg['priority'],maxShipping=integer(cfg.get('maxShipping'),100,100000,'Shipping budget'),maxDays=integer(cfg.get('maxDays'),1,14,'Delivery deadline'))
            else:
                if type(cfg.get('enabled')) is not bool: raise ValueError('Choose whether this partner is available.')
                excluded=cfg.get('excludedCities',[])
                if not isinstance(excluded,list) or any(x not in self.cities for x in excluded): raise ValueError('Unsupported excluded city.')
                current.update(enabled=cfg['enabled'],deliveryDays=integer(cfg.get('deliveryDays',current.get('deliveryDays',3)),1,14,'Promised transit days'),minPrice=integer(cfg.get('minPrice'),100,100000,'Minimum price'),maxDiscount=integer(cfg.get('maxDiscount'),0,40,'Maximum discount'),maxWeight=integer(cfg.get('maxWeight'),1,100,'Weight limit'),excludedCities=list(dict.fromkeys(excluded)))
            db.execute('UPDATE settings SET data=?,key_hash=? WHERE id=?',(canonical(current),digest(key) if key else old['key_hash'],identity))
        return dict(ok=True)
    def catalog(self):
        return dict(products=PRODUCTS,cities=list(self.cities),company=self.configuration()['company'],mode='simulation')
    def checkout(self, data):
        product=next((p for p in PRODUCTS if p['id']==data.get('productId')),None)
        if product is None: raise ValueError('Choose a product.')
        quantity=integer(data.get('quantity',1),1,5,'Quantity')
        name=str(data.get('customerName','')).strip()
        if not 2<=len(name)<=70: raise ValueError('Enter the recipient’s name.')
        destination=address(data.get('address'),self.cities)
        # Stable client id allows safe retry without creating another order or escrow debit.
        request_id=data.get('requestId','')
        if not isinstance(request_id,str) or not 8<=len(request_id)<=100: raise ValueError('A checkout request ID is required.')
        company=self.configuration()['company']
        payload=dict(orderId='SHOP-'+request_id,status='confirmed',seller=dict(name=company['name'],address=company['address']),customer=dict(name=name,address=destination),items=[dict(sku=product['id'],name=product['name'],quantity=quantity,unitPrice=product['price'],weightKg=product['weight'],dimensionsCm={k:product[k] for k in ['length','width','height']})])
        result=self.ingest(payload)
        return dict(id=result['id'],customerToken=result['customerToken'],status=result['status'])
    def parse(self, payload):
        if payload.get('status')!='confirmed': raise ValueError('Only confirmed orders can be dispatched.')
        external=payload.get('orderId')
        if not isinstance(external,str) or not 1<=len(external)<=120: raise ValueError('orderId is required (up to 120 characters).')
        seller=payload.get('seller',{}); customer=payload.get('customer',{})
        if not isinstance(seller,dict) or not isinstance(customer,dict): raise ValueError('Seller and customer are required.')
        origin=address(seller.get('address'),self.cities); destination=address(customer.get('address'),self.cities)
        items=payload.get('items')
        if not isinstance(items,list) or not 1<=len(items)<=20: raise ValueError('Provide 1–20 order items.')
        parsed=[]; weight=0; height=0; length=0; width=0; total=0
        for item in items:
            if not isinstance(item,dict): raise ValueError('Invalid order item.')
            quantity=integer(item.get('quantity'),1,20,'Item quantity')
            try:
                dims=item['dimensionsCm']; w=float(item['weightKg'])
                l,b,h=[float(dims[k]) for k in ['length','width','height']]
            except (KeyError,TypeError,ValueError): raise ValueError('Each item needs weightKg and length, width, height in dimensionsCm.')
            if any(not math.isfinite(x) or x<=0 for x in [w,l,b,h]) or w>100 or max(l,b,h)>200: raise ValueError('Invalid parcel measurements.')
            title=str(item.get('name','Parcel'))[:100]
            price=integer(item.get('unitPrice',0),0,100000000,'Item price in paise')
            weight+=w*quantity;length=max(length,l);width=max(width,b);height+=h*quantity;total+=price*quantity
            parsed.append(dict(name=title,quantity=quantity,unitPrice=price))
        if weight>100 or height>200: raise ValueError('Combined parcel exceeds demo limits: 100 kg or 200 cm height.')
        return dict(externalId=external,sellerAddress=origin,customerAddress=destination,customerName=str(customer.get('name','Customer'))[:70],items=parsed,productTotal=total,origin=origin['city'],destination=destination['city'],weight=round(weight,3),length=length,width=width,height=height)
    def ingest(self, payload, deferred=False):
        if not isinstance(payload,dict): raise ValueError('Order payload must be an object.')
        parsed=self.parse(payload); payload_hash=digest(canonical(payload))
        cfg=self.configuration(); quote=self.quote_engine(dict(parsed,priority=cfg['company']['priority']))
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            existing=db.execute('SELECT * FROM orders WHERE external_id=?',(parsed['externalId'],)).fetchone()
            if existing:
                if existing['payload_hash']!=payload_hash: raise ValueError('This orderId was already used with different order details.')
                o=json.loads(existing['data']);return dict(id=o['id'],customerToken=existing['token'],status=o['status'],duplicate=True)
            oid='PW-'+uuid.uuid4().hex[:10].upper();token=secrets.token_urlsafe(24)
            o=dict(id=oid,**parsed,status='received',phase=0,stage=0,created=now(),events=[dict(actor='Order endpoint',text='Everyday confirmed the order. Delivery request received through the Parcelwise API.',kind='received',at=now())],bids=[],offers=[],excluded=[],contract=None,feedback=None,policy=cfg['company'],customerToken=token,agentConfig=cfg['partners'],quoteSnapshot=quote,nextAt=(datetime.now(timezone.utc)+timedelta(seconds=2)).isoformat())
            db.execute('INSERT INTO orders VALUES(?,?,?,?,?,?)',(oid,parsed['externalId'],payload_hash,canonical(o),token,o['created']))
        if not deferred:
            for _ in range(8): self.advance_pipeline(oid,force=True)
            o=self.order(oid)
        return dict(id=oid,customerToken=token,status=o['status'],duplicate=False)

    def order(self, oid):
        with self.connect() as db:
            row=db.execute('SELECT data FROM orders WHERE id=?',(oid,)).fetchone()
            if row is None: raise ValueError('Order not found.')
            o=json.loads(row['data'])
            o['transactions']=[dict(r) for r in db.execute('SELECT * FROM ledger WHERE order_id=? ORDER BY created',(oid,))]
        o['route']=dict(pickup=self.cities[o['origin']],destination=self.cities[o['destination']])
        return o

    def tick(self):
        with self.connect() as db:
            ids=[r['id'] for r in db.execute("SELECT id FROM orders WHERE json_extract(data,'$.phase') < 8 AND json_extract(data,'$.nextAt') <= ?",(now(),))]
        for oid in ids: self.advance_pipeline(oid)

    def advance_pipeline(self, oid, force=False):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT data FROM orders WHERE id=?',(oid,)).fetchone()
            if row is None: raise ValueError('Order not found.')
            o=json.loads(row['data']);phase=o.get('phase',8)
            if phase>=8 or (not force and o['nextAt']>now()): return
            company=o['policy']
            def event(actor,text,kind): o['events'].append(dict(actor=actor,text=text,kind=kind,at=now()))
            if phase==0:
                o['status']='parsed'
                event('Dispatch agent',f"Parsed pickup in {o['origin']}, delivery in {o['destination']}, {o['weight']} kg, {o['length']:g} × {o['width']:g} × {o['height']:g} cm.",'parsed')
            elif phase==1:
                o['status']='broadcasting';o['candidates']=[]
                quote=o['quoteSnapshot'];source={p['id']:p for p in quote['partners']}
                event('Company agent','Broadcast route, parcel size, budget and deadline to connected partner agents.','broadcast')
                for p in o['agentConfig']:
                    carrier=source.get(p['id']);reason=None
                    if not p['enabled']: reason='Connection paused'
                    elif o['origin'] in p['excludedCities'] or o['destination'] in p['excludedCities']: reason='Route outside partner policy'
                    elif quote['billableWeight']>p['maxWeight']: reason='Parcel exceeds partner weight policy'
                    elif not carrier: reason='Carrier does not serve this parcel or route'
                    if reason:
                        o['excluded'].append(dict(id=p['id'],name=p['name'],reason=reason));event(p['name']+' agent',reason,'declined');continue
                    initial=max(carrier['price']*100,p['minPrice']);floor=max(p['minPrice'],math.ceil(initial*(100-p['maxDiscount'])/100))
                    o['candidates'].append(dict(carrier,days=p['deliveryDays'],openingPrice=initial,pricePaise=floor,minPrice=p['minPrice'],maxDiscount=p['maxDiscount']))
            elif phase in [2,3,4]:
                o['status']='bidding';round_number=phase-1
                # Persist one conversational turn per worker tick, including its actual bid.
                # Force mode drains one round for synchronous callers and deterministic tests.
                if o.get('chatRound')!=round_number:
                    o['chatRound']=round_number;o['chatCursor']=0;o['chatQueue']=[]
                    queue=o['chatQueue']
                    def say(actor,text,kind='counter',bid=None):
                        queue.append(dict(actor=actor,text=text,kind=kind,bid=bid))
                    if round_number==1:
                        say('Company agent',f"I’m shipping {o['weight']} kg from {o['origin']} to {o['destination']}. My policy allows at most ₹{company['maxShipping']/100:.2f} and {company['maxDays']} days. My priority is {company['priority']}. Please quote within those limits.")
                    for p in o['candidates']:
                        initial=p['openingPrice'];floor=p['pricePaise']
                        if round_number==1:
                            price=initial
                            text=f"My opening offer is ₹{price/100:.2f} with a {p['days']}-day promise. My policy: minimum ₹{p['minPrice']/100:.2f}, maximum concession {p['maxDiscount']}%."
                        else:
                            previous=next(b['price'] for b in reversed(o['bids']) if b['partner']==p['id'])
                            concession={'price':.15,'balanced':.10,'speed':.05,'reliability':.05}[company['priority']]
                            target=min(company['maxShipping'],math.floor(previous*(1-concession)))
                            say('Company agent',f"{p['name']}, {'can you accept my final counter of' if round_number==3 else 'can you meet'} ₹{target/100:.2f}? My {company['priority']} policy requests a {concession*100:g}% improvement, capped by my ₹{company['maxShipping']/100:.2f} budget. I still require delivery within {company['maxDays']} days.")
                            # The partner concedes toward the actual company counter, bounded
                            # by its floor and total discount policy. Never raise an earlier bid.
                            price=max(floor,min(previous,target))
                            text=f"{'Final offer' if round_number==3 else 'Counteroffer'}: ₹{price/100:.2f}, {p['days']} days. "
                            text+=(f"I cannot reach ₹{target/100:.2f}: my effective floor is ₹{floor/100:.2f} (minimum price and {p['maxDiscount']}% maximum discount). " if target<floor else 'I can meet that price within my policy. ')
                            text+=(f"I cannot promise your {company['maxDays']}-day deadline; my transit policy requires {p['days']} days." if p['days']>company['maxDays'] else 'My transit promise meets your deadline.')
                        say(p['name']+' agent',text,'offer',dict(partner=p['id'],round=round_number,price=price,days=p['days']))
                    if not queue:say('Company agent','No connected partner can serve this parcel and route.','counter')
                queue=o['chatQueue'];start=o['chatCursor'];end=len(queue) if force else start+1
                for message in queue[start:end]:
                    event(message['actor'],message['text'],message['kind'])
                    if message['bid']:
                        o['bids'].append(message['bid'])
                        if round_number==3:
                            for candidate in o['candidates']:
                                if candidate['id']==message['bid']['partner']:candidate['pricePaise']=message['bid']['price']
                o['chatCursor']=end
                if end<len(queue):phase-=1
            elif phase==5:
                final=[]
                for p in o['candidates']:
                    if p['pricePaise']<=company['maxShipping'] and p['days']<=company['maxDays']:
                        p['score']=self.score(p['pricePaise'],p,company['priority']);final.append(p)
                    else:
                        o['excluded'].append(dict(id=p['id'],name=p['name'],reason='Final offer exceeds company budget or deadline'))
                        event('Company agent',f"{p['name']}, I cannot accept ₹{p['pricePaise']/100:.2f} in {p['days']} days. My policy caps price at ₹{company['maxShipping']/100:.2f} and transit at {company['maxDays']} days.",'counter')
                final.sort(key=lambda p:(-p['score'],p['pricePaise'],p['id']));o['offers']=final
                if not final:
                    o['status']='needs_attention';phase=7
                    event('Dispatch agent','No acceptable deal meets company and partner policies. No funds moved.','attention')
                else:
                    o['winner']=final[0];o['status']='deal_finalized'
                    event('Company agent',f"Deal finalized with {final[0]['name']}: ₹{final[0]['pricePaise']/100:.2f}, {final[0]['days']} days. Best {company['priority']} match within policy.",'selected')
            elif phase==6:
                winner=o['winner'];terms=dict(orderId=oid,company='company',partner='partner:'+winner['id'],amount=winner['pricePaise'],currency='INR_DEMO',deliveryDays=winner['days'],releaseRule='Customer confirms receipt after partner delivery report',disputeRule='Hold escrow; demo company may refund',expiresAt=(datetime.now(timezone.utc)+timedelta(days=winner['days']+2)).isoformat())
                o['contract']=dict(id='SIM-'+uuid.uuid4().hex[:12].upper(),terms=terms,termsHash=digest(canonical(terms)),state='created',mode='simulation',createdAt=now());o['status']='contract_created'
                event('Contract simulator','Created a simulated smart contract with fixed deal terms. Awaiting escrow funding.','contract')
            elif phase==7:
                amount=o['winner']['pricePaise']
                if db.execute("SELECT balance FROM wallets WHERE id='company'").fetchone()['balance']<amount:
                    o['status']='needs_funding';event('Company wallet','Insufficient demo credits. Contract remains unfunded.','attention')
                else:
                    self.transfer(db,oid,'fund','company','escrow',amount);o['contract']['state']='funded';o['status']='booked';self.create_shipment(db,o)
                    event('Company wallet',f"Transferred ₹{amount/100:.2f} into simulated escrow. Ready for pickup; payout waits for customer confirmation.",'funded')
            o['phase']=phase+1;o['nextAt']=(datetime.now(timezone.utc)+timedelta(seconds=2.4 if o['status']=='bidding' else 4)).isoformat()
            db.execute('UPDATE orders SET data=? WHERE id=?',(canonical(o),oid))
    @staticmethod
    def score(price,p,priority):
        weights={'balanced':[.35,.25,.25,.15],'price':[.8,.1,.05,.05],'speed':[.15,.65,.1,.1],'reliability':[.1,.1,.55,.25]}[priority]
        metrics=[1/(1+price/25000),max(0,1-(p['days']-1)/6),p['reliability'],p['quality']]
        return round(100*sum(a*b for a,b in zip(weights,metrics)),2)
    def transfer(self,db,oid,action,sender,receiver,amount):
        if db.execute('SELECT 1 FROM ledger WHERE order_id=? AND action=?',(oid,action)).fetchone(): return
        result=db.execute('UPDATE wallets SET balance=balance-? WHERE id=? AND balance>=?',(amount,sender,amount))
        if result.rowcount!=1: raise ValueError('Insufficient demo wallet balance.')
        db.execute('UPDATE wallets SET balance=balance+? WHERE id=?',(amount,receiver))
        db.execute('INSERT INTO ledger VALUES(?,?,?,?,?,?,?)',('SIMTX-'+uuid.uuid4().hex[:12].upper(),oid,action,sender,receiver,amount,now()))
    @staticmethod
    def create_shipment(db,order):
        data={k:order[k] for k in ['origin','destination','weight','length','width','height']}
        data['priority']=order['policy']['priority'];data['partner']=dict(order['winner'],price=order['winner']['pricePaise']/100)
        db.execute('INSERT OR IGNORE INTO shipments(id,data,created) VALUES(?,?,?)',(order['id'],canonical(data),now()))
    def dashboard(self):
        with self.connect() as db:
            orders=[json.loads(r['data']) for r in db.execute('SELECT data FROM orders ORDER BY created DESC')]
            wallets={r['id']:r['balance'] for r in db.execute('SELECT * FROM wallets')}
            ledger=[dict(r) for r in db.execute('SELECT * FROM ledger ORDER BY created DESC')]
        return dict(orders=orders,wallets=wallets,ledger=ledger,config=self.configuration(),mode='simulation')
    def tracking(self, token):
        with self.connect() as db: row=db.execute('SELECT data FROM orders WHERE token=?',(token,)).fetchone()
        if row is None: raise ValueError('Delivery link not found.')
        o=json.loads(row['data'])
        return {k:o.get(k) for k in ['id','items','origin','destination','stage','status','winner','feedback']}
    def action(self,oid,action, data=None, token=None, partner=None):
        data=data or {}
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            row=db.execute('SELECT * FROM orders WHERE id=?',(oid,)).fetchone()
            if row is None: raise ValueError('Order not found.')
            o=json.loads(row['data']);contract=o.get('contract')
            if action in ['confirm','dispute','feedback'] and (not token or not hmac.compare_digest(token,row['token'])): raise PermissionError('A valid customer delivery link is required.')
            def event(actor,text,kind):o['events'].append(dict(actor=actor,text=text,kind=kind,at=now()))
            if action=='advance':
                if partner and o.get('winner',{}).get('id')!=partner: raise PermissionError('This partner was not selected for the delivery.')
                if not contract or contract['state']!='funded': raise ValueError('Only a funded delivery can move forward.')
                target=data.get('stage',o['stage']+1)
                integer(target,1,4,'Tracking stage')
                if target<=o['stage']: return dict(ok=True,duplicate=True)
                if target!=o['stage']+1: raise ValueError('Delivery stages must arrive in sequence.')
                o['stage']=target;o['status']=['booked','picked_up','in_transit','out_for_delivery','awaiting_confirmation'][target]
                db.execute('UPDATE shipments SET stage=? WHERE id=?',(target,oid))
                event(o['winner']['name'],['','Parcel picked up.','Parcel in transit.','Parcel out for delivery.','Partner reports delivery. Escrow stays locked until customer confirmation.'][target],'tracking')
            elif action=='confirm':
                if contract and contract['state']=='released':return dict(ok=True,duplicate=True)
                if o['stage']!=4 or not contract or contract['state']!='funded':raise ValueError('Delivery must be reported and escrow funded before confirmation.')
                self.transfer(db,oid,'release','escrow',contract['terms']['partner'],contract['terms']['amount'])
                contract['state']='released';o['status']='completed';event('Customer','Receipt confirmed. Simulated escrow released to the selected partner wallet.','released')
            elif action=='dispute':
                if contract and contract['state']=='disputed':return dict(ok=True,duplicate=True)
                if not contract or contract['state']!='funded' or o['stage']!=4:raise ValueError('An issue can be reported after delivery is claimed and before payout.')
                contract['state']='disputed';o['status']='disputed';event('Customer','Delivery issue reported. Payout is held for review.','disputed')
            elif action=='refund':
                if contract and contract['state']=='refunded':return dict(ok=True,duplicate=True)
                if not contract or (contract['state']!='disputed' and not (contract['state']=='funded' and now()>contract['terms']['expiresAt'])):raise ValueError('Refund requires a dispute or an expired delivery deadline.')
                self.transfer(db,oid,'refund','escrow','company',contract['terms']['amount'])
                contract['state']='refunded';o['status']='refunded';event('Escrow simulator','Held amount returned to the company wallet. No partner payout.','refunded')
            elif action=='fund':
                if not contract or o['status']!='needs_funding':raise ValueError('This deal is not awaiting funding.')
                self.transfer(db,oid,'fund','company','escrow',contract['terms']['amount']);contract['state']='funded';o['status']='booked';self.create_shipment(db,o);event('Company wallet','Simulated escrow funded. Delivery booked.','funded')
            elif action=='feedback':
                if o['stage']!=4:raise ValueError('Feedback opens after delivery is reported.')
                if o['feedback']:raise ValueError('Feedback has already been submitted.')
                rating=integer(data.get('rating'),1,5,'Rating')
                if type(data.get('ontime')) is not bool or type(data.get('success')) is not bool:raise ValueError('Choose delivery outcomes.')
                feedback=dict(rating=rating,quality=(rating-1)/4,ontime=int(data['ontime']),success=int(data['success']))
                o['feedback']=feedback;db.execute('UPDATE shipments SET feedback=? WHERE id=?',(canonical(feedback),oid));event('Customer','Delivery feedback saved to improve future route recommendations.','feedback')
            else: raise ValueError('Unknown action.')
            db.execute('UPDATE orders SET data=? WHERE id=?',(canonical(o),oid))
        return dict(ok=True)
