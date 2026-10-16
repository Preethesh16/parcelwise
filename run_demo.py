"""Run the independent storefront and delivery API without replacing other apps."""
import argparse
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--store-port',type=int,default=8000)
    parser.add_argument('--api-port',type=int,default=8001)
    args=parser.parse_args()
    if args.store_port==args.api_port:parser.error('Store and API need different ports.')
    for port in [args.store_port,args.api_port]:
        if not 1<=port<=65535:parser.error('Ports must be between 1 and 65535.')
        try:
            with socket.socket() as check:check.bind(('127.0.0.1',port))
        except OSError:parser.error(f'Port {port} is already in use. Choose another --store-port or --api-port.')
    root=Path(__file__).parent
    env=dict(os.environ)
    env.setdefault('PARCELWISE_API_URL',f'http://127.0.0.1:{args.api_port}')
    env.setdefault('PARCELWISE_PUBLIC_URL',f'http://localhost:{args.api_port}')
    env.setdefault('EVERYDAY_PUBLIC_URL',f'http://localhost:{args.store_port}')
    env['PARCELWISE_STOREFRONT_URL']=env['EVERYDAY_PUBLIC_URL']
    config=root/'.env'
    if config.exists():
        for line in config.read_text().splitlines():
            if line.strip() and not line.lstrip().startswith('#') and '=' in line:
                key,value=line.split('=',1)
                if key.strip().startswith('PARCELWISE_SMTP_'):env[key.strip()]=value.strip().strip('"').strip("'")
    children=[]
    try:
        for file,port in [('server.py',args.api_port),('storefront.py',args.store_port)]:
            children.append(subprocess.Popen([sys.executable,str(root/file),'--port',str(port)],cwd=root,env=env))
        print(f"Everyday: {env['EVERYDAY_PUBLIC_URL']}/shop\nSeller: {env['PARCELWISE_PUBLIC_URL']}/#login=seller\nCourier: {env['PARCELWISE_PUBLIC_URL']}/#login=partner",flush=True)
        while all(p.poll() is None for p in children):time.sleep(.5)
    except KeyboardInterrupt:pass
    finally:
        for p in children:
            if p.poll() is None:p.terminate()
        for p in children:p.wait()

if __name__=='__main__':main()
