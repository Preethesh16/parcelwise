import unittest
from http.cookies import SimpleCookie
import portal_auth

class PortalSessionTests(unittest.TestCase):
    def test_accounts_stay_independent_and_logout_is_scoped(self):
        jar=SimpleCookie()
        for account in ['company','partner:A','partner:B','partner:C']:
            for cookie in portal_auth.create(account,{}): jar.load(cookie)
        cookies='; '.join(f'{k}={v.value}' for k,v in jar.items())
        for account in ['company','partner:A','partner:B','partner:C']:
            self.assertEqual(portal_auth.identity({'Cookie':cookies,'X-Portal-Account':account}),account)
        portal_auth.logout({'Cookie':cookies,'X-Portal-Account':'partner:A'})
        self.assertIsNone(portal_auth.identity({'Cookie':cookies,'X-Portal-Account':'partner:A'}))
        self.assertEqual(portal_auth.identity({'Cookie':cookies,'X-Portal-Account':'company'}),'company')
        self.assertIsNone(portal_auth.identity({'Cookie':'','X-Portal-Account':'company'}))
