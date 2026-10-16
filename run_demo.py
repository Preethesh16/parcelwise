"""Run the independent storefront and delivery API together for the local demo."""
import argparse, os, subprocess, sys, time
from pathlib import Path
root=Path(__file__).parent
parser=argparse.ArgumentParser()
parser.add_argument('--store-port',type=int,default=8000)
args=parser.parse_args()
env=dict(os.environ,PARCELWISE_STOREFRONT_URL=f'http://localhost:{args.store_port}')
# Optional local sender credentials; this file is ignored by Git.
config=root/'.env'
if config.exists():
    for line in config.read_text().splitlines():
        if line.strip() and not line.lstrip().startswith('#') and '=' in line:
            key,value=line.split('=',1)
            if key.strip().startswith('PARCELWISE_SMTP_'):env[key.strip()]=value.strip().strip('"').strip("'")
children=[]
try:
    for file in ['server.py','storefront.py']:
        command=[sys.executable,str(root/file)]
        if file=='storefront.py':command+=['--port',str(args.store_port)]
        children.append(subprocess.Popen(command,cwd=root,env=env))
    while all(p.poll() is None for p in children):time.sleep(.5)
finally:
    for p in children:p.terminate()
    for p in children:p.wait()
