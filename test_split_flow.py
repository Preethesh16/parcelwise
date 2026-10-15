import copy,json,sqlite3,tempfile,threading,unittest,urllib.request,urllib.error
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
import server,storefront
from workflow import Workflow,canonical

class SplitFlowTests(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.old_db=server.DB;self.old_store=storefront.DB
  server.DB=Path(self.temp.name)/'parcel.sqlite3';storefront.DB=Path(self.temp.name)/'store.sqlite3'
  server.init();server.flow.init();storefront.init()
  self.payload=json.loads(Path('static/api-example.json').read_text())
 def tearDown(self):server.DB=self.old_db;storefront.DB=self.old_store;self.temp.cleanup()
 def test_each_phase_is_persisted_before_funding(self):
  r=server.flow.ingest(self.payload,deferred=True);oid=r['id']
  self.assertEqual(r['status'],'awaiting_seller');self.assertEqual(server.flow.dashboard()['ledger'],[])
  server.flow.action(oid,'negotiate')
  for expected in ['parsed','broadcasting','bidding','bidding','bidding','awaiting_selection']:
   server.flow.advance_pipeline(oid,force=True);o=server.flow.order(oid)
   self.assertEqual(o['status'],expected);self.assertEqual(o['transactions'],[])
  self.assertEqual(len(o['bids']),9);self.assertIsNone(o['contract'])
  server.flow.action(oid,'select',dict(partnerId=o['offers'][0]['id']))
  server.flow.advance_pipeline(oid,force=True)
  self.assertEqual(server.flow.order(oid)['contract']['state'],'created')
  restored=Workflow(server.connect,server.quotes,server.CITIES);restored.init()
  with ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(lambda _:restored.advance_pipeline(oid,force=True),range(4)))
  o=restored.order(oid);self.assertEqual(o['status'],'booked');self.assertEqual(len(o['transactions']),1)
  self.assertEqual(sum(restored.dashboard()['wallets'].values()),1000000)
  self.assertEqual(o['route']['pickup'],server.CITIES[o['origin']])
 def test_scheduler_waits_and_recovers_pending_work(self):
  r=server.flow.ingest(self.payload,deferred=True);server.flow.tick();self.assertEqual(server.flow.order(r['id'])['phase'],8)
  server.flow.action(r['id'],'negotiate')
  with server.connect() as db:
   o=server.flow.order(r['id']);o['nextAt']='2000-01-01';db.execute('UPDATE orders SET data=? WHERE id=?',(canonical(o),r['id']))
  server.flow.tick();self.assertEqual(server.flow.order(r['id'])['phase'],1)
 def test_two_http_apps_redirect_and_retry_after_outage(self):
  api=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler);shop=storefront.ThreadingHTTPServer(('127.0.0.1',0),storefront.Handler)
  for http in [api,shop]:threading.Thread(target=http.serve_forever,daemon=True).start()
  data=dict(productId='bag',quantity=1,customerName='API Demo',address=dict(line1='24 Test Street',city='Bengaluru',postalCode='560001'),requestId='independent-checkout-001')
  def purchase():
   req=urllib.request.Request(f'http://127.0.0.1:{shop.server_port}/api/checkout',data=json.dumps(data).encode(),headers={'Content-Type':'application/json'})
   with urllib.request.urlopen(req) as res:return json.load(res)
  try:
   with patch.object(storefront,'API','http://127.0.0.1:1'):
    with self.assertRaises(urllib.error.HTTPError) as err:purchase()
    self.assertEqual(err.exception.code,503)
   with storefront.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM checkouts').fetchone()[0],1)
   self.assertEqual(server.flow.dashboard()['orders'],[])
   with patch.object(storefront,'API',f'http://127.0.0.1:{api.server_port}'):
    first=purchase();second=purchase()
   self.assertEqual(first,second);self.assertEqual(first['status'],'awaiting_seller')
   self.assertEqual(first['redirectUrl'],storefront.PUBLIC+'/#track='+first['customerToken'])
   self.assertEqual(len(server.flow.dashboard()['orders']),1);self.assertEqual(server.flow.dashboard()['ledger'],[])
   with storefront.connect() as db:self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'checkouts'})
  finally:
   for http in [api,shop]:http.shutdown();http.server_close()
 def test_chat_turns_are_saved_individually_and_resume(self):
  r=server.flow.ingest(self.payload,deferred=True);oid=r['id']
  server.flow.action(oid,'negotiate')
  for _ in range(2):server.flow.advance_pipeline(oid,force=True)
  def due_tick():
   with server.connect() as db:
    o=json.loads(db.execute('SELECT data FROM orders WHERE id=?',(oid,)).fetchone()['data']);o['nextAt']='2000-01-01';db.execute('UPDATE orders SET data=? WHERE id=?',(canonical(o),oid))
   server.flow.tick()
  due_tick();o=server.flow.order(oid)
  self.assertEqual(o['phase'],2);self.assertEqual(o['chatCursor'],1);self.assertEqual(o['bids'],[])
  self.assertIn('My policy allows',o['events'][-1]['text'])
  server.flow.init();due_tick();o=server.flow.order(oid)
  self.assertEqual(len(o['bids']),1);self.assertEqual(o['chatCursor'],2)
  self.assertIn('My policy:',o['events'][-1]['text']);self.assertEqual(o['transactions'],[])
  for _ in range(2):due_tick()
  self.assertEqual(server.flow.order(oid)['phase'],3)
 def test_company_policy_changes_counters_and_partner_respects_floor(self):
  results={}
  for priority in ['price','speed']:
   cfg=server.flow.configuration()['company'];cfg['priority']=priority;cfg['maxShipping']=25000
   server.flow.save_config(dict(id='company',config=cfg))
   payload=copy.deepcopy(self.payload);payload['orderId']='policy-'+priority
   r=server.flow.ingest(payload);server.flow.action(r['id'],'negotiate')
   for _ in range(6):server.flow.advance_pipeline(r['id'],force=True)
   o=server.flow.order(r['id']);results[priority]=o
   for partner in o['agentConfig']:
    bids=[b for b in o['bids'] if b['partner']==partner['id']]
    if not bids:continue
    self.assertTrue(all(b['price']>=partner['minPrice'] for b in bids))
    self.assertGreaterEqual(bids[-1]['price'],bids[0]['price']*(100-partner['maxDiscount'])/100)
    self.assertLessEqual(bids[-1]['price'],bids[0]['price'])
   self.assertTrue(any('My '+priority+' policy requests' in e['text'] for e in o['events']))
  price={b['partner']:b['price'] for b in results['price']['bids'] if b['round']==2}
  speed={b['partner']:b['price'] for b in results['speed']['bids'] if b['round']==2}
  self.assertTrue(any(price[p]<speed[p] for p in price))
 def test_changed_retry_is_rejected(self):
  r=server.flow.ingest(self.payload,deferred=True)
  self.assertEqual(server.flow.ingest(self.payload,deferred=True)['id'],r['id'])
  payload=copy.deepcopy(self.payload);payload['customer']['name']='Changed'
  with self.assertRaises(ValueError):server.flow.ingest(payload,deferred=True)
  self.assertEqual(server.flow.dashboard()['ledger'],[])
if __name__=='__main__':unittest.main()
