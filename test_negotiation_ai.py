import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import negotiation_ai as ai
import server


class OpenAITests(unittest.TestCase):
    def reply(self, price=100, explanation='Within policy.'):
        return io.BytesIO(json.dumps(dict(status='completed', output=[dict(type='message', content=[dict(type='output_text', text=json.dumps(dict(price=price, explanation=explanation)))])])).encode())

    @patch.dict(os.environ, {'OPENAI_API_KEY':'test-only', 'PARCELWISE_AI_MODE':'openai'})
    def test_structured_request_and_valid_output(self):
        with patch('urllib.request.urlopen', return_value=self.reply()) as call:
            self.assertEqual(ai.propose('seller', {'budget':200}, 50, 200)['price'], 100)
            payload=json.loads(call.call_args.args[0].data)
            self.assertFalse(payload['store'])
            self.assertTrue(payload['text']['format']['strict'])
            self.assertNotIn('test-only', json.dumps(payload))

    @patch.dict(os.environ, {'OPENAI_API_KEY':'test-only'})
    def test_invalid_offers_fail_closed(self):
        for price in [True, 2.5, 49, 201, '100']:
            with self.subTest(price=price), patch('urllib.request.urlopen', return_value=self.reply(price)):
                with self.assertRaises(ValueError): ai.propose('partner', {}, 50, 200)
        with patch('urllib.request.urlopen', side_effect=TimeoutError('secret upstream details')):
            with self.assertRaisesRegex(ValueError, 'valid policy-compliant'): ai.propose('partner', {}, 50, 200)

    @patch.dict(os.environ, {'OPENAI_API_KEY':'', 'PARCELWISE_AI_MODE':'openai'})
    def test_missing_key_never_calls_network(self):
        with patch('urllib.request.urlopen') as call:
            with self.assertRaisesRegex(ValueError, 'key is missing'): ai.propose('seller', {}, 1, 100)
            call.assert_not_called()

    @patch.dict(os.environ, {'OPENAI_API_KEY':'test-only', 'PARCELWISE_AI_MODE':'openai'})
    def test_live_rounds_still_require_manual_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            original=server.DB
            try:
                server.DB=Path(directory)/'test.db';server.init();server.flow.init()
                with server.connect() as db: db.execute("UPDATE settings SET data=json_set(data,'$.autoDispatch',json('false')) WHERE id='company'")
                flow=server.flow
                oid=flow.ingest(json.loads(Path('static/api-example.json').read_text()))['id']
                flow.action(oid, 'negotiate')
                contexts=[]
                def proposal(role, context, low, high):
                    contexts.append(context.copy())
                    return dict(price=low, explanation='Policy-compliant counter.')
                with patch.object(ai, 'propose', side_effect=proposal) as call:
                    for _ in range(6): flow.advance_pipeline(oid, force=True)
                    self.assertGreater(call.call_count, 0)
                order=flow.order(oid)
                self.assertEqual(order['status'], 'awaiting_selection')
                self.assertIsNone(order['contract']);self.assertNotIn('winner', order)
                self.assertEqual(order['transactions'], [])
                self.assertNotIn(order['customerToken'], json.dumps(contexts))
                self.assertNotIn(order['customerAddress']['line1'], json.dumps(contexts))
                flow.action(oid, 'negotiate')
                for _ in range(2): flow.advance_pipeline(oid, force=True)
                with patch.object(ai, 'round_messages', side_effect=ValueError('Provider unavailable')):
                    flow.advance_pipeline(oid, force=True)
                failed=flow.order(oid)
                self.assertEqual(failed['status'], 'needs_attention')
                self.assertEqual(failed['phase'], 8)
                self.assertEqual(failed['negotiationError'], 'Provider unavailable')
                self.assertEqual(failed['transactions'], [])
            finally: server.DB=original


if __name__=='__main__': unittest.main()

class ProposalRecoveryTests(unittest.TestCase):
    def test_completed_proposals_are_reused_after_partial_failure(self):
        order=dict(id='cache-test',origin='Mumbai',destination='Pune',weight=1,
            policy=dict(maxShipping=25000,maxDays=5,priority='balanced'),
            bids=[],candidates=[dict(id='A',name='Blue Dart',openingPrice=10000,pricePaise=8000,days=4)])
        saved={}
        calls=[]
        def propose(role,context,low,high):
            calls.append(role)
            if role.startswith('delivery'):raise ValueError('Provider unavailable')
            return dict(price=9000,explanation='Within budget.')
        with patch.object(ai,'propose',side_effect=propose):
            with self.assertRaises(ValueError):ai.round_messages(order,1,saved.get,lambda k,v:saved.update({k:v}))
        self.assertEqual(len(saved),1)
        with patch.object(ai,'propose',return_value=dict(price=9000,explanation='Accepted.')) as call:
            result=ai.round_messages(order,1,saved.get,lambda k,v:saved.update({k:v}))
            self.assertEqual(call.call_count,1)
            self.assertEqual(result[1]['bid']['price'],9000)
        with patch.object(ai,'propose') as call:
            ai.round_messages(order,1,saved.get,lambda k,v:saved.update({k:v}))
            call.assert_not_called()
