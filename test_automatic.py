import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import server
import analytics
from workflow import Workflow,canonical

class AutomaticJourneyTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=server.DB
        server.DB=Path(self.temp.name)/'automatic.db';server.init();server.flow.init()
        self.payload=json.loads(Path('static/api-example.json').read_text())
    def tearDown(self):
        server.DB=self.old;self.temp.cleanup()
    def test_automatic_journey_survives_restart_and_settles_once(self):
        result=server.flow.ingest(self.payload);oid=result['id']
        self.assertEqual(result['status'],'received')
        states=[]
        for _ in range(8):
            server.flow.advance_pipeline(oid,force=True)
            states.append(server.flow.order(oid)['status'])
        self.assertEqual(states,['parsed','broadcasting','bidding','bidding','bidding','deal_finalized','contract_created','booked'])
        selected=server.flow.order(oid)
        self.assertEqual(len(selected['bids']),15)
        self.assertEqual(len(selected['transactions']),1)
        restored=Workflow(server.connect,server.quotes,server.CITIES);restored.init()
        for stage in range(1,5):
            with server.connect() as db:
                o=restored.order(oid);o['nextDeliveryAt']='2000-01-01'
                db.execute('UPDATE orders SET data=? WHERE id=?',(canonical(o),oid))
            restored.tick()
            self.assertEqual(restored.order(oid)['stage'],stage)
        self.assertEqual(restored.order(oid)['status'],'awaiting_confirmation')
        self.assertEqual(restored.order(oid)['contract']['state'],'funded')
        for _ in range(2):restored.action(oid,'confirm',token=result['customerToken'])
        self.assertEqual(len(restored.order(oid)['transactions']),2)
        self.assertEqual(sum(restored.dashboard()['wallets'].values()),1000000)
        restored.action(oid,'feedback',dict(rating=5,ontime=True,success=True,comment='Great delivery'),token=result['customerToken'])
        a=analytics.summarize(restored.dashboard()['orders'])
        self.assertEqual(a['summary']['rating'],5)
        self.assertEqual(a['summary']['ontime'],100)
    def test_seed_is_repeatable_and_preserves_live_data_and_money(self):
        r=server.flow.ingest(self.payload)
        before=server.flow.order(r['id']);wallets=server.flow.dashboard()['wallets']
        analytics.seed_history(server.flow);analytics.seed_history(server.flow)
        data=server.flow.dashboard()
        self.assertEqual(len(data['orders']),751)
        self.assertEqual(wallets,data['wallets']);self.assertEqual(data['ledger'],[])
        self.assertEqual(before,server.flow.order(r['id']))
        stats=analytics.summarize(data['orders'],dict(source='synthetic'))
        self.assertEqual(stats['summary']['completed'],750)
        self.assertEqual(len(stats['partners']),5)
        self.assertTrue(all(p['orders']==150 for p in stats['partners']))
        self.assertLess(stats['correlation'],0)
        self.assertEqual(analytics.summarize(data['orders'],dict(source='checkout'))['summary']['orders'],1)
    def test_no_eligible_offer_never_funds(self):
        cfg=server.flow.configuration()['company'];cfg['maxShipping']=100
        server.flow.save_config(dict(id='company',config=cfg))
        r=server.flow.ingest(self.payload)
        for _ in range(8):server.flow.advance_pipeline(r['id'],force=True)
        self.assertEqual(server.flow.order(r['id'])['status'],'needs_attention')
        self.assertEqual(server.flow.dashboard()['ledger'],[])
    def test_metrics_missing_values_and_known_correlation(self):
        rows=[]
        for i in range(10):
            rows.append(dict(id=str(i),created='2026-01-01T00:00:00+00:00',origin='Mumbai',destination='Pune',status='completed',
                winner=dict(id='A',name='Blue Dart',days=2,pricePaise=10000),actualDeliveryDays=2+i,
                feedback=dict(rating=5-i*.4),contract=dict(state='released')))
        a=analytics.summarize(rows)
        self.assertEqual(a['summary']['ontime'],10)
        self.assertEqual(a['summary']['shippingSpend'],100000)
        self.assertEqual(a['correlation'],-1)
        self.assertIsNone(analytics.summarize([])['summary']['rating'])
