"""Run locally to configure Gmail without putting credentials in chat or shell history."""
from getpass import getpass
from pathlib import Path
import os

if __name__=='__main__':
    print('Parcelwise Gmail sender: abhinavshetty0504@gmail.com')
    print('Create a Gmail app password at https://myaccount.google.com/apppasswords')
    password=getpass('Gmail app password (hidden): ').replace(' ','').strip()
    if len(password)!=16 or not password.isalnum():
        raise SystemExit('Expected a 16-character Gmail app password; nothing was saved.')
    path=Path(__file__).parent/'.env'
    lines=path.read_text().splitlines() if path.exists() else []
    lines=[line for line in lines if not line.startswith('PARCELWISE_SMTP_')]
    lines.extend(['PARCELWISE_SMTP_HOST=smtp.gmail.com','PARCELWISE_SMTP_PORT=465','PARCELWISE_SMTP_USER=abhinavshetty0504@gmail.com','PARCELWISE_SMTP_PASSWORD='+password])
    fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:f.write('\n'.join(lines)+'\n')
    os.chmod(path,0o600)
    print('Saved locally in the Git-ignored .env. Restart run_demo.py to enable queued confirmations.')
