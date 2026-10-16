"""Persistent, server-side delivery confirmations via Gmail/SMTP."""
import json
import os
import smtplib
import ssl
from email.message import EmailMessage

RECIPIENT='abhinavshetty0504@gmail.com'

def configured():
    return bool(os.getenv('PARCELWISE_SMTP_USER') and os.getenv('PARCELWISE_SMTP_PASSWORD'))

def enqueue(db, order):
    partner=order['winner']
    subject=f"Parcelwise | Delivery partner confirmed — {order['id']}"
    body=(f"Dear Abhinav,\n\n"
          f"Your Everyday Store order {order['id']} has been assigned to {partner['name']} in the Parcelwise delivery demo.\n\n"
          f"Delivery partner: {partner['name']}\n"
          f"Agreed shipping price: INR {partner['pricePaise']/100:,.2f}\n"
          f"Estimated delivery: within {partner['days']} days\n"
          f"Route: {order['origin']} to {order['destination']}\n"
          f"Items: {', '.join(str(i['quantity'])+' × '+i['name'] for i in order['items'])}\n\n"
          "Parcelwise will now prepare the simulated delivery contract and fund escrow from the store's demo wallet. "
          "The dashboard will show pickup, transit, delivery and escrow release automatically.\n\n"
          "This is a demonstration confirmation: no real carrier booking, payment or delivery has been made.\n\n"
          "Kind regards,\nParcelwise\nDelivery coordination for Everyday Store")
    db.execute('INSERT OR IGNORE INTO email_outbox(order_id,recipient,subject,body,status) VALUES(?,?,?,?,?)',
               (order['id'],RECIPIENT,subject,body,'queued'))

def send_pending(connect):
    if not configured(): return
    with connect() as db:
        db.execute('BEGIN IMMEDIATE')
        row=db.execute("SELECT * FROM email_outbox WHERE status='queued' ORDER BY rowid LIMIT 1").fetchone()
        if not row:return
        row=dict(row)
        db.execute("UPDATE email_outbox SET status='sending',error=NULL WHERE order_id=?",(row['order_id'],))
    message=EmailMessage()
    message['From']='Parcelwise <'+os.environ['PARCELWISE_SMTP_USER']+'>'
    message['To']=row['recipient'];message['Subject']=row['subject']
    message['Message-ID']=f"<{row['order_id'].lower()}.partner-confirmation@parcelwise.local>"
    message.set_content(row['body'])
    submitted=False
    try:
        with smtplib.SMTP_SSL(os.getenv('PARCELWISE_SMTP_HOST','smtp.gmail.com'),int(os.getenv('PARCELWISE_SMTP_PORT','465')),context=ssl.create_default_context(),timeout=20) as smtp:
            smtp.login(os.environ['PARCELWISE_SMTP_USER'],os.environ['PARCELWISE_SMTP_PASSWORD'])
            submitted=True
            smtp.send_message(message)
            with connect() as db:db.execute("UPDATE email_outbox SET status='sent',sent_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE order_id=?",(row['order_id'],))
    except Exception:
        # Delivery after submission can be ambiguous. Never blindly resend it.
        with connect() as db:
            db.execute("UPDATE email_outbox SET status=?,error=? WHERE order_id=? AND status!='sent'",('unknown' if submitted else 'failed','Check sender configuration or mail provider; automatic retries are disabled to avoid duplicate email.',row['order_id']))

def status(db, oid):
    row=db.execute('SELECT status,recipient,sent_at FROM email_outbox WHERE order_id=?',(oid,)).fetchone()
    if not row:return None
    result=dict(row)
    if result['status']=='queued' and not configured():result['status']='needs_configuration'
    return result
