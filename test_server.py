import json, tempfile, threading, unittest, urllib.request, urllib.error
from pathlib import Path
import server

class ParcelwiseTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory(); server.DB=Path(cls.tmp.name)/'test.sqlite3'; server.init()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)
    @classmethod
    def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close(); cls.tmp.cleanup()
    def setUp(self):
        with server.connect() as db: db.execute('DELETE FROM shipments')
    def data(self,**kw): return dict(origin='Mumbai',destination='Bengaluru',weight=2,length=25,width=20,height=15,priority='balanced',**kw)
    def post(self,path,d):
        req=urllib.request.Request(self.base+'/api/'+path,data=json.dumps(d).encode(),headers={'Content-Type':'application/json'})
        try:
            with urllib.request.urlopen(req) as r: return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e: return e.code,json.load(e)
    def test_rankings_deals(self):
        for priority,expected in [('price','A'),('speed','B'),('reliability','C')]:
            d=self.data(); d['priority']=priority;q=server.quotes(d)
            self.assertEqual(q['partners'][0]['id'],expected)
            for p in q['partners']: self.assertTrue(0<=p['score']<=100);self.assertEqual(p['price'],p['original']-p['discount'])
    def test_eligibility_and_volumetric(self):
        d=self.data();d['destination']='Jaipur';self.assertNotIn('B',[p['id'] for p in server.quotes(d)['partners']])
        d.update(length=100,width=100,height=100);q=server.quotes(d);self.assertEqual(q['billableWeight'],200);self.assertEqual(q['partners'],[])
        self.assertEqual(self.post('shipments',dict(d,partner='A'))[0],400)
    def test_validation(self):
        for key,val in [('weight',-2),('weight','NaN'),('length',0),('destination','Unknown'),('priority','invalid')]:
            d=self.data();d[key]=val;self.assertEqual(self.post('quotes',d)[0],400)
    def test_lifecycle_feedback_persistence(self):
        before=next(p for p in server.quotes(self.data())['partners'] if p['id']=='A')
        status,s=self.post('shipments',self.data(partner='A'));self.assertEqual(status,201)
        f=dict(id=s['id'],rating=1,ontime=False,success=False)
        self.assertEqual(self.post('feedback',f)[0],400)
        for _ in range(5): self.assertEqual(self.post('advance',{'id':s['id']})[0],200)
        self.assertEqual(self.post('feedback',f)[0],200);self.assertEqual(self.post('feedback',f)[0],400)
        after=next(p for p in server.quotes(self.data())['partners'] if p['id']=='A')
        self.assertEqual(after['routeReviews'],before['routeReviews']+1)
        self.assertTrue(0<before['quality']-after['quality']<.025)
        other=self.data();other['destination']='Delhi';q=next(p for p in server.quotes(other)['partners'] if p['id']=='A')
        self.assertGreater(q['quality'],after['quality'])
        server.init(); saved=next(x for x in server.shipments() if x['id']==s['id']);self.assertEqual(saved['stage'],4);self.assertEqual(saved['feedback']['rating'],1)
    def test_unknown_shipment(self): self.assertEqual(self.post('advance',{'id':'missing'})[0],404)

if __name__=='__main__': unittest.main()
