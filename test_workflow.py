import copy
import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import server

class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();server.DB=Path(self.tmp.name)/'flow.sqlite3'
        server.init();server.flow.init()
        with server.connect() as db: db.execute("UPDATE settings SET data=json_set(data,'$.autoDispatch',json('false')) WHERE id='company'")
        self.flow=server.flow
    def tearDown(self): self.tmp.cleanup()
    def checkout(self,request='test-order-001'):
        r=self.flow.checkout(dict(productId='bag',quantity=1,customerName='Demo Customer',address=dict(line1='24 Lake Road',city='Bengaluru',postalCode='560001'),requestId=request))
        self.approve(r)
        r['status']=self.flow.order(r['id'])['status']
        return r
    def approve(self,r):
        self.flow.action(r['id'],'negotiate')
        for _ in range(6):self.flow.advance_pipeline(r['id'],force=True)
        o=self.flow.order(r['id'])
        if o['offers']:
            self.flow.action(r['id'],'select',dict(partnerId=o['offers'][0]['id']))
            for _ in range(2):self.flow.advance_pipeline(r['id'],force=True)
    def order(self,result): return next(o for o in self.flow.dashboard()['orders'] if o['id']==result['id'])
    def delivered(self,r):
        for _ in range(4):self.flow.action(r['id'],'advance')
    def test_checkout_to_payout_and_feedback(self):
        r=self.checkout();o=self.order(r);amount=o['contract']['terms']['amount'];wallet=self.flow.dashboard()['wallets']
        self.assertEqual(wallet['company'],1000000-amount);self.assertEqual(wallet['escrow'],amount)
        self.assertEqual(len(o['bids']),15);self.assertEqual(o['stage'],0)
        with self.assertRaises(ValueError):self.flow.action(r['id'],'confirm',token=r['customerToken'])
        self.delivered(r);self.assertEqual(self.flow.dashboard()['wallets']['escrow'],amount)
        self.flow.action(r['id'],'confirm',token=r['customerToken'])
        self.flow.action(r['id'],'confirm',token=r['customerToken'])
        wallets=self.flow.dashboard()['wallets'];self.assertEqual(wallets['escrow'],0);self.assertEqual(sum(wallets.values()),1000000)
        self.assertEqual(wallets['partner:'+o['winner']['id']],amount)
        self.assertEqual(len(self.flow.dashboard()['ledger']),2)
        self.flow.action(r['id'],'feedback',dict(rating=2,ontime=False,success=True),token=r['customerToken'])
        self.assertEqual(self.order(r)['feedback']['rating'],2)
        with self.assertRaises(ValueError):self.flow.action(r['id'],'feedback',dict(rating=5,ontime=True,success=True),token=r['customerToken'])
        self.assertEqual(self.order(r)['contract']['termsHash'],o['contract']['termsHash'])
    def test_duplicate_checkout_atomic(self):
        payload=json.loads(Path('static/api-example.json').read_text())
        with ThreadPoolExecutor(max_workers=4) as executor:results=list(executor.map(lambda _:self.flow.ingest(payload),range(4)))
        self.assertEqual(len({r['id'] for r in results}),1)
        self.assertEqual(len(self.flow.dashboard()['ledger']),0)
    def test_policy_floors_and_discounts(self):
        r=self.checkout();o=self.order(r)
        cfg={p['id']:p for p in self.flow.configuration()['partners']}
        for offer in o['offers']:
            self.assertGreaterEqual(offer['pricePaise'],cfg[offer['id']]['minPrice'])
            self.assertGreaterEqual(offer['pricePaise'],offer['openingPrice']*(100-cfg[offer['id']]['maxDiscount'])/100)
    def test_no_deal_no_debit(self):
        config=self.flow.configuration()['company'];config['maxShipping']=100
        self.flow.save_config(dict(id='company',config=config))
        r=self.checkout();self.assertEqual(r['status'],'needs_attention');self.assertEqual(self.flow.dashboard()['wallets']['company'],1000000)
        self.assertEqual(self.flow.dashboard()['ledger'],[])
    def test_no_connected_partner(self):
        for p in self.flow.configuration()['partners']:
            p['enabled']=False;self.flow.save_config(dict(id='partner:'+p['id'],config=p))
        self.assertEqual(self.checkout()['status'],'needs_attention')
    def test_dispute_refund_no_double_spend(self):
        r=self.checkout();self.delivered(r)
        self.flow.action(r['id'],'dispute',token=r['customerToken'])
        with self.assertRaises(ValueError):self.flow.action(r['id'],'confirm',token=r['customerToken'])
        self.flow.action(r['id'],'refund');self.flow.action(r['id'],'refund')
        self.assertEqual(self.flow.dashboard()['wallets']['company'],1000000)
        self.assertEqual(self.flow.dashboard()['wallets']['escrow'],0)
        self.assertEqual(len(self.flow.dashboard()['ledger']),2)
    def test_wrong_customer_and_partner(self):
        r=self.checkout();o=self.order(r)
        with self.assertRaises(PermissionError):self.flow.action(r['id'],'confirm',token='invalid')
        other=next(x for x in ['A','B','C'] if x!=o['winner']['id'])
        with self.assertRaises(PermissionError):self.flow.action(r['id'],'advance',partner=other)
        self.assertNotIn('sellerAddress',self.flow.tracking(r['customerToken']))
        self.assertNotIn('customerAddress',self.flow.tracking(r['customerToken']))
    def test_insufficient_funds(self):
        with server.connect() as db:db.execute("UPDATE wallets SET balance=0 WHERE id='company'")
        r=self.checkout();self.assertEqual(r['status'],'needs_funding');self.assertEqual(self.flow.dashboard()['ledger'],[])
        with self.assertRaises(ValueError):self.flow.action(r['id'],'advance')
        with server.connect() as db:db.execute("UPDATE wallets SET balance=1000000 WHERE id='company'")
        self.flow.action(r['id'],'fund');self.assertEqual(self.order(r)['status'],'booked')
    def test_key_rotation_and_no_plaintext(self):
        self.assertTrue(self.flow.authorized('company','demo-company-key'))
        self.flow.save_config(dict(id='company',config=self.flow.configuration()['company'],apiKey='sandbox-new-key-123456'))
        self.assertFalse(self.flow.authorized('company','demo-company-key'));self.assertTrue(self.flow.authorized('company','sandbox-new-key-123456'))
        with server.connect() as db:row=dict(db.execute("SELECT * FROM settings WHERE id='company'").fetchone())
        self.assertNotIn('sandbox-new-key-123456',json.dumps(row));self.assertNotIn('key_hash',json.dumps(self.flow.dashboard()))
    def test_parser_validation(self):
        with self.assertRaises(ValueError):self.flow.ingest(dict(orderId='x',status='pending'))
        with self.assertRaises(ValueError):self.flow.checkout(dict(productId='not-real'))
        r=self.checkout();o=self.order(r)
        self.assertEqual(o['origin'],'Mumbai');self.assertEqual(o['destination'],'Bengaluru');self.assertEqual(o['weight'],1.2)
    def test_transit_policy_changes_eligibility(self):
        for partner in self.flow.configuration()['partners']:
            partner['deliveryDays']=14
            self.flow.save_config(dict(id='partner:'+partner['id'],config=partner))
        self.assertEqual(self.checkout()['status'],'needs_attention')
    def test_replayed_delivery_and_persistence(self):
        r=self.checkout();o=self.order(r);partner=o['winner']['id']
        self.flow.action(r['id'],'advance',dict(stage=1),partner=partner)
        self.flow.action(r['id'],'advance',dict(stage=1),partner=partner)
        self.assertEqual(self.order(r)['stage'],1)
        with self.assertRaises(ValueError):self.flow.action(r['id'],'advance',dict(stage=4),partner=partner)
        server.init();self.flow.init()
        self.assertEqual(self.order(r)['stage'],1)
        self.assertEqual(len(self.flow.dashboard()['ledger']),1)
        self.assertEqual(sum(self.flow.dashboard()['wallets'].values()),1000000)
    def test_expired_contract_refund(self):
        r=self.checkout()
        with server.connect() as db:
            row=db.execute('SELECT data FROM orders WHERE id=?',(r['id'],)).fetchone()
            order=json.loads(row['data'])
            order['contract']['terms']['expiresAt']='2000-01-01T00:00:00+00:00'
            db.execute('UPDATE orders SET data=? WHERE id=?',(json.dumps(order),r['id']))
        self.flow.action(r['id'],'refund')
        self.assertEqual(self.flow.dashboard()['wallets']['company'],1000000)
    def test_valid_order_webhook_and_retry(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=http.serve_forever,daemon=True).start()
        payload=json.loads((Path(__file__).parent/'static/api-example.json').read_text())
        def post(path,data,key):
            req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/'+path,data=json.dumps(data).encode(),headers={'Content-Type':'application/json','X-API-Key':key})
            with urllib.request.urlopen(req) as response:return json.load(response)
        try:
            r=post('integrations/orders',payload,'demo-company-key')
            duplicate=post('integrations/orders',payload,'demo-company-key')
            self.assertEqual(r['id'],duplicate['id']);self.assertTrue(duplicate['duplicate'])
            self.approve(r)
            winner=self.order(r)['winner']['id']
            event=dict(orderId=r['id'],partnerId=winner,stage=1)
            post('integrations/delivery',event,'demo-partner-'+winner+'-key')
            self.assertTrue(post('integrations/delivery',event,'demo-partner-'+winner+'-key')['duplicate'])
            event.pop('stage')
            with self.assertRaises(urllib.error.HTTPError) as caught:post('integrations/delivery',event,'demo-partner-'+winner+'-key')
            self.assertEqual(caught.exception.code,400);caught.exception.close()
            self.assertEqual(self.order(r)['stage'],1)
        finally:http.shutdown();http.server_close()

    def test_external_endpoint_auth(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        thread=threading.Thread(target=http.serve_forever,daemon=True);thread.start()
        try:
            req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/integrations/orders',data=b'{}',headers={'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as caught:urllib.request.urlopen(req)
            self.assertEqual(caught.exception.code,401);caught.exception.close()
        finally:http.shutdown();http.server_close()

if __name__=='__main__':unittest.main()
