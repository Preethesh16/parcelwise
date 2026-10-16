"""Shared observed metrics and reproducible, separately labelled sample history."""
import hashlib
import json
import math
import random
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

def seed_history(flow):
    from workflow import PRODUCTS, canonical
    rng=random.Random(20261016)
    cfg=flow.configuration()
    anchor=datetime.now(timezone.utc).replace(hour=12,minute=0,second=0,microsecond=0)-timedelta(days=7)
    cities=list(flow.cities)
    with flow.connect() as db:
        db.execute('CREATE TABLE IF NOT EXISTS dataset_versions (id TEXT PRIMARY KEY, created TEXT NOT NULL)')
        if db.execute("SELECT 1 FROM dataset_versions WHERE id='history-v1'").fetchone(): return
        for i in range(750):
            p=cfg['partners'][i%len(cfg['partners'])];product=PRODUCTS[i%3];oid=f'HISTORY-{i+1:04d}'
            created=anchor-timedelta(days=rng.randrange(173),hours=rng.randrange(12))
            promised=p['deliveryDays'];late=rng.random()<[.12,.09,.07,.18,.06][i%5]
            duration=promised+rng.choice([1,1,2,3]) if late else max(1,promised-rng.choice([0,0,1]))
            delivered=created+timedelta(days=duration)
            rating=max(1,min(5,round(rng.gauss(3 if late else 4.6,.65))))
            feedback=None if rng.random()<.16 else dict(rating=rating,quality=(rating-1)/4,ontime=int(not late),success=1,
                comment=rng.choice(['Arrived safely and on time.','Easy delivery, parcel in good condition.','Good communication throughout.']) if not late else rng.choice(['Parcel was safe but arrived later than promised.','Delivery took an extra day.','Please improve delivery updates when delayed.']),
                created=(delivered+timedelta(hours=2)).isoformat())
            destination=rng.choice([c for c in cities if c!='Mumbai'])
            price=max(p['minPrice'],round((90+duration*14+rng.randrange(70))*100))
            winner=dict(id=p['id'],name=p['name'],pricePaise=price,openingPrice=price+1800,days=promised,score=86,
                reliability=.95,quality=.9,routeReviews=0,allReviews=0)
            terms=dict(amount=price,partner=p['wallet'],deliveryDays=promised,currency='INR_DEMO',releaseRule='Customer confirms receipt',expiresAt=(created+timedelta(days=promised+2)).isoformat())
            o=dict(id=oid,externalId=oid,source='synthetic',automatic=False,phase=8,nextAt=None,stage=4,status='completed',
                created=created.isoformat(),dispatchedAt=created.isoformat(),promisedAt=(created+timedelta(days=promised)).isoformat(),
                deliveredAt=delivered.isoformat(),simulatedDeliveredAt=delivered.isoformat(),actualDeliveryDays=duration,delayDays=max(0,duration-promised),
                sellerName=cfg['company']['name'],sellerAddress=cfg['company']['address'],
                customerName=f'Sample Customer {i+1:03d}',customerAddress=dict(line1=f'{i+10} Sample Avenue',city=destination,postalCode='560001'),
                origin='Mumbai',destination=destination,items=[dict(name=product['name'],quantity=1,unitPrice=product['price'])],productTotal=product['price'],
                weight=product['weight'],length=product['length'],width=product['width'],height=product['height'],
                requirements=dict(maxDays=5,fragile=product['id']=='lamp'),policy=cfg['company'],winner=winner,offers=[winner],bids=[],excluded=[],
                contract=dict(id='HIST-CONTRACT-'+str(i),state='released',mode='synthetic',terms=terms,termsHash=hashlib.sha256(canonical(terms).encode()).hexdigest()),
                feedback=feedback,customerToken=None,events=[dict(actor='Historical sample',kind='history',text='Synthetic completed delivery for analytics. No live wallet movement.',at=delivered.isoformat())])
            db.execute('INSERT OR IGNORE INTO orders VALUES(?,?,?,?,?,?)',(oid,oid,hashlib.sha256(oid.encode()).hexdigest(),canonical(o),'synthetic-private-'+oid,created.isoformat()))
        db.execute('INSERT INTO dataset_versions VALUES(?,?)',('history-v1',datetime.now(timezone.utc).isoformat()))

def summarize(orders, filters=None):
    filters=filters or {}
    selected=[]
    for o in orders:
        if filters.get('partner') and o.get('winner',{}).get('id')!=filters['partner']:continue
        if filters.get('source') in ['synthetic','checkout'] and o.get('source','checkout')!=filters['source']:continue
        if filters.get('status') and o['status']!=filters['status']:continue
        date=o['created'][:10]
        if filters.get('from') and date<filters['from']:continue
        if filters.get('to') and date>filters['to']:continue
        selected.append(o)
    def metrics(rows):
        ratings=[o['feedback']['rating'] for o in rows if o.get('feedback')]
        timings=[o for o in rows if o.get('actualDeliveryDays') is not None and o.get('winner')]
        complete=[o for o in rows if o['status']=='completed']
        return dict(orders=len(rows),completed=len(complete),active=sum(o['status'] in ['booked','picked_up','in_transit','out_for_delivery'] for o in rows),
            shippingSpend=sum(o.get('winner',{}).get('pricePaise',0) for o in rows if o.get('contract',{} ) and o['contract']['state'] in ['funded','released','disputed']),
            earnings=sum(o.get('winner',{}).get('pricePaise',0) for o in complete),
            rating=round(sum(ratings)/len(ratings),2) if ratings else None,reviews=len(ratings),
            ontime=round(100*sum(o['actualDeliveryDays']<=o['winner']['days'] for o in timings)/len(timings),1) if timings else None,
            timingSamples=len(timings),transitDays=round(sum(o['actualDeliveryDays'] for o in timings)/len(timings),2) if timings else None,
            delayDays=round(sum(max(0,o['actualDeliveryDays']-o['winner']['days']) for o in timings)/len(timings),2) if timings else None)
    by_partner=defaultdict(list);by_week=defaultdict(list);by_route=defaultdict(list)
    for o in selected:
        if o.get('winner'):by_partner[o['winner']['id']].append(o)
        dt=datetime.fromisoformat(o['created']);week=(dt-timedelta(days=dt.weekday())).date().isoformat()
        by_week[week].append(o);by_route[o['origin']+' → '+o['destination']].append(o)
    points=[dict(id=o['id'],delay=max(0,o['actualDeliveryDays']-o['winner']['days']),rating=o['feedback']['rating'],partner=o['winner']['name']) for o in selected if o.get('feedback') and o.get('actualDeliveryDays') is not None and o.get('winner')]
    correlation=None
    if len(points)>=10:
        xs=[p['delay'] for p in points];ys=[p['rating'] for p in points];mx=sum(xs)/len(xs);my=sum(ys)/len(ys)
        denominator=math.sqrt(sum((x-mx)**2 for x in xs)*sum((y-my)**2 for y in ys))
        if denominator:correlation=round(sum((x-mx)*(y-my) for x,y in zip(xs,ys))/denominator,3)
    return dict(summary=metrics(selected),partners=[dict(id=pid,name=rows[-1]['winner']['name'],**metrics(rows)) for pid,rows in by_partner.items()],
        weeks=[dict(week=week,**metrics(rows)) for week,rows in sorted(by_week.items())],
        routes=[dict(route=route,**metrics(rows)) for route,rows in sorted(by_route.items())],
        ratings={str(i):sum(o.get('feedback',{}).get('rating')==i for o in selected if o.get('feedback')) for i in range(1,6)},
        scatter=points,correlation=correlation,correlationSamples=len(points),syntheticCount=sum(o.get('source')=='synthetic' for o in selected))
