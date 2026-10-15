import json
import tempfile
import threading
import unittest
import urllib.request
import urllib.error
from http.cookiejar import CookieJar
from pathlib import Path
import analytics
import server

class PortalAnalyticsTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.old=server.DB
        server.DB=Path(self.temp.name)/'portal.db';server.init();server.flow.init()
        analytics.seed_history(server.flow)
        self.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        threading.Thread(target=self.http.serve_forever,daemon=True).start()
        self.client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(CookieJar()))
    def tearDown(self):
        self.http.shutdown();self.http.server_close();server.DB=self.old;self.temp.cleanup()
    def request(self,path,account='company',data=None):
        req=urllib.request.Request(f'http://127.0.0.1:{self.http.server_port}/api/'+path,
            data=json.dumps(data).encode() if data is not None else None,
            headers={'Content-Type':'application/json','X-Portal-Account':account})
        try:
            with self.client.open(req) as r:return r.status,json.load(r)
        except urllib.error.HTTPError as e:
            with e:return e.code,json.load(e)
    def test_independent_sessions_and_company_filter(self):
        self.assertEqual(self.request('analytics')[0],401)
        self.assertEqual(self.request('login',data=dict(account='company',key='demo-company-key'))[0],200)
        for pid in 'ABCDE':
            account='partner:'+pid
            self.assertEqual(self.request('login',account,dict(account=account,key='demo-partner-'+pid+'-key'))[0],200)
            status,a=self.request('analytics',account);self.assertEqual(status,200)
            self.assertEqual(a['summary']['orders'],150)
            self.assertEqual([p['id'] for p in a['partners']],[pid])
            other='B' if pid=='A' else 'A'
            self.assertEqual(self.request('analytics?partner='+other,account)[1]['summary']['orders'],0)
            self.assertEqual(self.request('connections',account,dict(id='company',config={}))[0],401)
        self.assertEqual(self.request('analytics')[1]['summary']['orders'],750)
        self.assertEqual(self.request('analytics?partner=A')[1]['summary']['orders'],150)
        self.request('logout','partner:E',{})
        self.assertEqual(self.request('analytics','partner:E')[0],401)
        self.assertEqual(self.request('analytics')[0],200)
        self.assertEqual(self.request('analytics','partner:A')[0],200)
    def test_partner_order_access_is_scoped(self):
        self.request('login','partner:A',dict(account='partner:A',key='demo-partner-A-key'))
        self.assertEqual(self.request('v1/orders/HISTORY-0002','partner:A')[0],403)
        status,o=self.request('v1/orders/HISTORY-0001','partner:A')
        self.assertEqual(status,200);self.assertNotIn('customerToken',o)
