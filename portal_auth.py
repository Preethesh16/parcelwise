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
    name='pw_'+account.replace(':','_') if account=='company' or account in ['partner:'+x for x in 'ABCDE'] else 'pw_session'
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
        sessions[value] = dict(account=account, expires=time.time()+28800)
    return [name+'='+value+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800' for name in ['pw_session','pw_'+account.replace(':','_')]]


def logout(headers):
    account=identity(headers)
    with lock: sessions.pop(token(headers), None)
    names=['pw_session']+(['pw_'+account.replace(':','_')] if account else [])
    return [name+'=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' for name in names]
