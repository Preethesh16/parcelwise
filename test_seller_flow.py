import copy, json, tempfile, unittest
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import server
import threading, urllib.request, urllib.error

class SellerDecisionTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=server.DB
        server.DB=Path(self.tmp.name)/'test.sqlite3'
        server.init();server.flow.init()
        self.f=server.flow
        self.payload=json.loads(Path('static/api-example.json').read_text())
    def tearDown(self):
        server.DB=self.old;self.tmp.cleanup()
    def create(self):
        return self.f.ingest(self.payload)['id']
    def negotiate(self,oid,**limits):
        self.f.action(oid,'negotiate',limits)
        for _ in range(6):self.f.advance_pipeline(oid,force=True)
        return self.f.order(oid)
    def test_automatic_start_respects_requirements_and_does_not_restart(self):
        self.payload['requirements']=dict(maxDays=2,fragile=True)
        oid=self.create()
        self.f.tick()
        o=self.f.order(oid)
        self.assertEqual(o['policy']['maxDays'],2)
        self.assertTrue(o['policy']['fragile'])
        self.assertEqual(o['status'],'parsed')
        self.f.tick()
        o=self.f.order(oid)
        self.assertEqual(sum(e['kind']=='negotiation_requested' for e in o['events']),1)
        self.assertEqual(self.f.dashboard()['ledger'],[])
        for _ in range(6):self.f.advance_pipeline(oid,force=True)
        self.assertEqual(self.f.order(oid)['status'],'awaiting_selection')

    def test_no_booking_without_explicit_seller_selection(self):
        oid=self.create()
        for _ in range(10):self.f.advance_pipeline(oid,force=True)
        self.assertEqual(self.f.order(oid)['status'],'awaiting_seller')
        with self.assertRaises(ValueError):self.f.action(oid,'select',dict(partnerId='A'))
        o=self.negotiate(oid)
        for _ in range(10):self.f.advance_pipeline(oid,force=True)
        self.assertEqual(self.f.order(oid)['status'],'awaiting_selection')
        self.assertNotIn('winner',o);self.assertIsNone(o['contract'])
        self.assertEqual(self.f.dashboard()['ledger'],[])
        alternative=o['offers'][-1]['id']
        self.f.action(oid,'select',dict(partnerId=alternative))
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _:self.f.advance_pipeline(oid,force=True),range(4)))
        booked=self.f.order(oid)
        self.assertEqual(booked['winner']['id'],alternative)
        self.assertEqual(booked['status'],'booked')
        self.assertEqual(len(booked['transactions']),1)
        self.assertTrue(self.f.action(oid,'select',dict(partnerId=alternative))['duplicate'])
        other=next(x for x in ['A','B','C'] if x!=alternative)
        with self.assertRaises(ValueError):self.f.action(oid,'select',dict(partnerId=other))
        with self.assertRaises(PermissionError):self.f.action(oid,'advance',dict(stage=1),partner=other)
    def test_customer_deadline_and_fragile_constraints_cannot_be_relaxed(self):
        self.payload['requirements']=dict(maxDays=2,fragile=True)
        oid=self.create();o=self.negotiate(oid,maxDays=14,fragile=False)
        self.assertEqual(o['policy']['maxDays'],2);self.assertTrue(o['policy']['fragile'])
        self.assertEqual([p['id'] for p in o['offers']],['B'])
        with self.assertRaises(ValueError):self.f.action(oid,'select',dict(partnerId='A'))
    def test_no_match_and_renegotiation(self):
        oid=self.create();o=self.negotiate(oid,maxShipping=100)
        self.assertEqual(o['status'],'needs_attention')
        self.assertEqual(self.f.dashboard()['ledger'],[])
        o=self.negotiate(oid,maxShipping=25000,minReliability=100)
        self.assertEqual(o['status'],'needs_attention')
        o=self.negotiate(oid,maxShipping=25000,minReliability=90)
        self.assertEqual(o['status'],'awaiting_selection')
        self.assertEqual(len(o['bids']),9)
    def test_feedback_changes_next_negotiation_profile(self):
        oid=self.create();o=self.negotiate(oid)
        chosen=o['offers'][0]
        self.f.action(oid,'select',dict(partnerId=chosen['id']))
        for _ in range(2):self.f.advance_pipeline(oid,force=True)
        for n in range(1,5):self.f.action(oid,'advance',dict(stage=n),partner=chosen['id'])
        self.f.action(oid,'confirm',token=o['customerToken'])
        self.f.action(oid,'feedback',dict(rating=1,ontime=False,success=False,comment='Late and damaged'),token=o['customerToken'])
        self.payload['orderId']='SECOND-ORDER'
        second=self.negotiate(self.create())
        updated=next(p for p in second['offers'] if p['id']==chosen['id'])
        self.assertLess(updated['reliability'],chosen['reliability'])
        self.assertLess(updated['quality'],chosen['quality'])
        self.assertEqual(updated['routeReviews'],1)
        self.assertEqual(self.f.order(oid)['feedback']['comment'],'Late and damaged')
    def test_portal_actions_over_http(self):
        http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=http.serve_forever,daemon=True).start()
        from http.cookiejar import CookieJar
        opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
        def post(path,body):
            req=urllib.request.Request(f'http://127.0.0.1:{http.server_port}/api/'+path,data=json.dumps(body).encode(),headers={'Content-Type':'application/json'})
            try:
                with opener.open(req) as res:return res.status,json.load(res)
            except urllib.error.HTTPError as res:
                with res:return res.code,json.load(res)
        try:
            oid=self.create()
            self.assertEqual(post('demo/order-action',dict(id=oid,action='negotiate'))[0],401)
            self.assertEqual(post('login',dict(account='company',key='incorrect'))[0],401)
            self.assertEqual(post('login',dict(account='company',key='demo-company-key'))[0],200)
            self.assertEqual(post('demo/order-action',dict(id=oid,action='negotiate'))[0],200)
            for _ in range(6):self.f.advance_pipeline(oid,force=True)
            o=self.f.order(oid);winner=o['offers'][0]['id']
            self.assertEqual(post('demo/order-action',dict(id=oid,action='select',partnerId=winner))[0],200)
            for _ in range(2):self.f.advance_pipeline(oid,force=True)
            other=next(x for x in ['A','B','C'] if x!=winner)
            self.assertEqual(post('demo/partner-action',dict(orderId=oid,partnerId=other,stage=1))[0],401)
            self.assertEqual(post('login',dict(account='partner:'+winner,key='demo-partner-'+winner+'-key'))[0],200)
            self.assertEqual(post('demo/order-action',dict(id=oid,action='refund'))[0],401)
            with opener.open(f'http://127.0.0.1:{http.server_port}/api/platform') as response:
                dashboard=json.load(response)
                self.assertEqual(len(dashboard['config']['partners']),1)
                self.assertTrue(all(x['winner']['id']==winner for x in dashboard['orders']))
                self.assertNotIn('customerToken',dashboard['orders'][0])
            for stage in range(1,5):
                self.assertEqual(post('demo/partner-action',dict(orderId=oid,partnerId=winner,stage=stage))[0],200)
            self.assertEqual(post('tracking-action',dict(id=oid,token='wrong',action='confirm'))[0],401)
            self.assertEqual(post('tracking-action',dict(id=oid,token=o['customerToken'],action='confirm'))[0],200)
            self.assertEqual(post('tracking-action',dict(id=oid,token=o['customerToken'],action='feedback',rating=5,ontime=True,success=True,comment='Smooth delivery'))[0],200)
            self.assertEqual(post('logout',{})[0],200)
            self.assertEqual(post('demo/partner-action',dict(orderId=oid,partnerId=winner,stage=4))[0],401)
        finally:
            http.shutdown();http.server_close()
if __name__=='__main__':unittest.main()
