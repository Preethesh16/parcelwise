"""Run the independent storefront and delivery API together for the local demo."""
import subprocess, sys, time
from pathlib import Path
root=Path(__file__).parent
children=[]
try:
    for file in ['server.py','storefront.py']:children.append(subprocess.Popen([sys.executable,str(root/file)],cwd=root))
    while all(p.poll() is None for p in children):time.sleep(.5)
finally:
    for p in children:p.terminate()
    for p in children:p.wait()
