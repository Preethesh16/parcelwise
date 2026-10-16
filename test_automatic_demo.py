import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
import server
import delivery_email

class AutomaticDemoTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.old=server.DB
        server.DB=Path(self.tmp.name)/'test.sqlite3';server.init();server.flow.init()
        self.payload=json.loads(Path('static/api-example.json').read_text())
    def tearDown(self):
        server.DB=self.old;self.tmp.cleanup()
    def due_tick(self,oid):
        with server.connect() as db:
            o=json.loads(db.execute('SELECT data FROM orders WHERE id=?',(oid,)).fetchone()['data'])
            o['nextAt']='2000-01-01T00:00:00+00:00'
            db.execute('UPDATE orders SET data=? WHERE id=?',(json.dumps(o),oid))
        server.flow.tick()
    @patch.dict('os.environ',{'PARCELWISE_AI_MODE':'local','PARCELWISE_SMTP_PASSWORD':''})
    def test_full_demo_persists_and_funds_once(self):
        oid=server.flow.ingest(self.payload)['id'];states=[]
        for _ in range(50):
            self.due_tick(oid)
            o=server.flow.order(oid);states.append(o['status'])
            if o['status']=='booked':server.flow.init() # restart-safe persisted state
            if o['status']=='completed':break
        self.assertEqual(o['status'],'completed')
        for state in ['deal_finalized','contract_created','booked','picked_up','in_transit','out_for_delivery','awaiting_confirmation','completed']:self.assertIn(state,states)
        self.assertEqual(o['winner']['id'],o['recommended'])
        self.assertEqual(o['contract']['state'],'released')
        self.assertIsNone(o['feedback']) # never invent customer ratings
        self.assertTrue(any(e['actor']=='Demo receipt simulator' for e in o['events']))
        before=server.flow.dashboard()['wallets']
        for _ in range(3):server.flow.tick()
        self.assertEqual(server.flow.dashboard()['wallets'],before)
        self.assertEqual(before['company'],1000000-o['winner']['pricePaise'])
        self.assertEqual(before['escrow'],0)
        self.assertEqual(sum(before.values()),1000000)
        self.assertEqual(len(o['transactions']),2)
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM email_outbox').fetchone()[0],1)
        self.assertEqual(o['email']['status'],'needs_configuration')
    @patch.dict('os.environ',{'PARCELWISE_AI_MODE':'local','PARCELWISE_SMTP_USER':'demo@example.com','PARCELWISE_SMTP_PASSWORD':'fake-test-only'})
    def test_confirmation_email_once(self):
        oid=server.flow.ingest(self.payload)['id']
        for _ in range(40):
            self.due_tick(oid)
            if server.flow.order(oid).get('winner'):break
        with patch('delivery_email.smtplib.SMTP_SSL') as smtp:
            delivery_email.send_pending(server.connect)
            delivery_email.send_pending(server.connect)
            instance=smtp.return_value.__enter__.return_value
            self.assertEqual(instance.send_message.call_count,1)
            msg=instance.send_message.call_args.args[0]
            self.assertEqual(msg['To'],'abhinavshetty0504@gmail.com')
            self.assertIn('no real carrier booking',msg.get_content())
            self.assertIn('Agreed shipping price: INR',msg.get_content())
        self.assertEqual(server.flow.order(oid)['email']['status'],'sent')
    @patch.dict('os.environ',{'PARCELWISE_AI_MODE':'local'})
    def test_no_offer_does_not_book_or_send(self):
        oid=server.flow.ingest(self.payload)['id']
        server.flow.action(oid,'negotiate',dict(maxShipping=100))
        for _ in range(35):self.due_tick(oid)
        self.assertEqual(server.flow.order(oid)['status'],'needs_attention')
        self.assertFalse(server.flow.dashboard()['ledger'])
        with server.connect() as db:self.assertEqual(db.execute('SELECT count(*) FROM email_outbox').fetchone()[0],0)
