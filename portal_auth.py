"""Local demo access-key sessions. Production identity is intentionally out of scope."""
import secrets
import threading
import time
from http.cookies import SimpleCookie

sessions = {}
lock = threading.Lock()


def token(headers):
    cookie = SimpleCookie()
    try: cookie.load(headers.get('Cookie', ''))
    except Exception: return ''
    account=headers.get('X-Portal-Account','')
    name='pw_session_'+account.replace(':','_') if account else 'pw_session'
    return cookie[name].value if name in cookie else ''


def identity(headers):
    with lock:
        session = sessions.get(token(headers))
        if session and session['expires'] > time.time(): return session['account']
    return None


def create(account, headers):
    value = secrets.token_urlsafe(32)
    with lock:
        for key in list(sessions):
            if sessions[key]['expires'] <= time.time(): del sessions[key]
        # Keep other account sessions available in separate demo tabs.
        sessions[value] = dict(account=account, expires=time.time()+28800)
    return ['pw_session='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800', 'pw_session_'+account.replace(':','_')+'='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800']


def logout(headers):
    with lock: sessions.pop(token(headers), None)
    return 'pw_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'
