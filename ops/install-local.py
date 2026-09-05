#!/usr/bin/env python3
"""Install the Skyglow website without replacing the existing Antenna Observatory."""
import os,plistlib,shutil,subprocess,sys,time
from pathlib import Path
root=Path(__file__).resolve().parents[1]
base=Path.home()/'Library/Application Support/Skyglow';app=base/'app';env=base/'venv'
base.mkdir(parents=True,exist_ok=True)
if not (env/'bin/python3').exists():subprocess.run(['/usr/bin/python3','-m','venv',str(env)],check=True)
subprocess.run([str(env/'bin/pip'),'install','-r',str(root/'server/requirements.txt')],check=True)
label='local.skyglow.web';service=f'gui/{os.getuid()}/{label}'
subprocess.run(['launchctl','bootout',service],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
app.mkdir(exist_ok=True)
for name in ('server','dist'):
    destination=app/name
    if destination.exists():shutil.rmtree(destination)
    shutil.copytree(root/name,destination,ignore=shutil.ignore_patterns('__pycache__'))
logs=Path.home()/'Library/Logs/skyglow.log'
plist={'Label':label,'ProgramArguments':[str(env/'bin/python3'),str(app/'server/skyglow.py'),'--port','8790'],
       'WorkingDirectory':str(app),'EnvironmentVariables':{'PATH':'/opt/homebrew/bin:/usr/bin:/bin','PYTHONUNBUFFERED':'1'},
       'RunAtLoad':True,'KeepAlive':True,'ThrottleInterval':10,'StandardOutPath':str(logs),'StandardErrorPath':str(logs)}
path=Path.home()/'Library/LaunchAgents'/f'{label}.plist';path.parent.mkdir(exist_ok=True)
path.write_bytes(plistlib.dumps(plist))
for attempt in range(5):
    result=subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(path)],capture_output=True,text=True)
    if result.returncode==0:break
    if attempt==4:raise RuntimeError(result.stderr.strip())
    time.sleep(1)

print('Skyglow installed at http://localhost:8790')
