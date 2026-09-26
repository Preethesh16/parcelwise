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
  self.assertEqual(r['status'],'received');self.assertEqual(server.flow.dashboard()['ledger'],[])
  for expected in ['parsed','broadcasting','bidding','bidding','bidding','deal_finalized','contract_created']:
   server.flow.advance_pipeline(oid,force=True);o=server.flow.order(oid)
   self.assertEqual(o['status'],expected);self.assertEqual(o['transactions'],[])
  self.assertEqual(len(o['bids']),9);self.assertEqual(o['contract']['state'],'created')
  restored=Workflow(server.connect,server.quotes,server.CITIES);restored.init()
  with ThreadPoolExecutor(max_workers=4) as ex:list(ex.map(lambda _:restored.advance_pipeline(oid,force=True),range(4)))
  o=restored.order(oid);self.assertEqual(o['status'],'booked');self.assertEqual(len(o['transactions']),1)
  self.assertEqual(sum(restored.dashboard()['wallets'].values()),1000000)
  self.assertEqual(o['route']['pickup'],server.CITIES[o['origin']])
 def test_scheduler_waits_and_recovers_pending_work(self):
  r=server.flow.ingest(self.payload,deferred=True);server.flow.tick();self.assertEqual(server.flow.order(r['id'])['phase'],0)
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
   with sqlite3.connect(storefront.DB) as db:self.assertEqual(db.execute('SELECT count(*) FROM checkouts').fetchone()[0],1)
   self.assertEqual(server.flow.dashboard()['orders'],[])
   with patch.object(storefront,'API',f'http://127.0.0.1:{api.server_port}'):
    first=purchase();second=purchase()
   self.assertEqual(first,second);self.assertEqual(first['status'],'received')
   self.assertEqual(first['redirectUrl'],storefront.PUBLIC+'/#order='+first['id'])
   self.assertEqual(len(server.flow.dashboard()['orders']),1);self.assertEqual(server.flow.dashboard()['ledger'],[])
   with sqlite3.connect(storefront.DB) as db:self.assertEqual({r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")},{'checkouts'})
  finally:
   for http in [api,shop]:http.shutdown();http.server_close()
 def test_changed_retry_is_rejected(self):
  r=server.flow.ingest(self.payload,deferred=True)
  self.assertEqual(server.flow.ingest(self.payload,deferred=True)['id'],r['id'])
  payload=copy.deepcopy(self.payload);payload['customer']['name']='Changed'
  with self.assertRaises(ValueError):server.flow.ingest(payload,deferred=True)
  self.assertEqual(server.flow.dashboard()['ledger'],[])
if __name__=='__main__':unittest.main()
