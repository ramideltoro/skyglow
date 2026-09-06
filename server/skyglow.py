#!/usr/bin/env python3
"""Skyglow: local radio controller, aircraft archive, and mobile web server."""
import argparse, base64, collections, concurrent.futures, datetime as dt, hashlib, html, http.cookies, json, math, mimetypes, queue
import os, re, secrets, shutil, signal, sqlite3, subprocess, threading, time, urllib.error, urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse, parse_qs, quote, unquote, urlencode
from access import LoginStore

HOME = Path.home()
ROOT = Path(__file__).resolve().parents[1]
STATE = Path(os.environ.get('SKYGLOW_STATE', HOME/'Library/Application Support/Skyglow/state'))
ORIGINAL = HOME/'Library/Application Support/AntennaObservatory/state'
AIR_PLIST = HOME/'Library/LaunchAgents/local.airplanes-live.readsb.plist'
AIR_LABEL = f'gui/{os.getuid()}/local.airplanes-live.readsb'
PUBLIC = 'https://skyglow.ramideltoro.com'
OWNER_USERNAME = 'sqwak'
SERIAL = '96195546'
MODES = ('aircraft', 'listen', 'satellite', 'sensors')
WEATHER_CHANNELS = (162.400,162.425,162.450,162.475,162.500,162.525,162.550)
ENRICHMENT_USER_AGENT = 'Skyglow/0.1 (https://skyglow.ramideltoro.com)'

def read_json(p, default=None):
    try: return json.loads(Path(p).read_text())
    except (OSError, ValueError): return default

def text_value(value, limit=160):
    return str(value).strip()[:limit] if value is not None else ''

def safe_remote_url(value, hosts):
    try:
        parsed=urlparse(str(value))
        return str(value) if parsed.scheme=='https' and parsed.hostname in hosts else None
    except (TypeError,ValueError):return None

def photo_records(data, large=True, limit=6):
    photos=data.get('photos',[]) if isinstance(data,dict) else []
    if not isinstance(photos,list):return []
    result=[];seen=set()
    for item in photos:
        if not isinstance(item,dict):continue
        preferred=item.get('thumbnail_large' if large else 'thumbnail',{})
        fallback=item.get('thumbnail' if large else 'thumbnail_large',{})
        rendition=preferred if isinstance(preferred,dict) and preferred.get('src') else fallback
        src=safe_remote_url(rendition.get('src') if isinstance(rendition,dict) else None,{'t.plnspttrs.net'})
        link=safe_remote_url(item.get('link'),{'www.planespotters.net','planespotters.net'})
        if not src or not link or src in seen:continue
        result.append({'src':src,'link':link,'photographer':text_value(item.get('photographer'),80),'source':'PlaneSpotters','license':''})
        seen.add(src)
        if len(result)>=limit:break
    return result

def photo_record(data, large=True):
    photos=photo_records(data,large,1)
    return photos[0] if photos else None

def plain_html(value, limit=80):
    value=re.sub(r'<[^>]*>',' ',str(value or ''))
    return text_value(re.sub(r'\s+',' ',html.unescape(value)),limit)

def commons_photo_records(data, registration, limit=6):
    query=data.get('query',{}) if isinstance(data,dict) else {}
    pages=query.get('pages',[]) if isinstance(query,dict) else []
    registration=text_value(registration,16).upper()
    if not isinstance(pages,list) or not registration:return []
    result=[];seen=set()
    for page in pages:
        if not isinstance(page,dict) or registration not in text_value(page.get('title'),240).upper():continue
        imageinfo=page.get('imageinfo',[])
        if not isinstance(imageinfo,list) or not imageinfo or not isinstance(imageinfo[0],dict):continue
        item=imageinfo[0]
        src=safe_remote_url(item.get('thumburl') or item.get('url'),{'thumb.wikimedia.org','upload.wikimedia.org'})
        link=safe_remote_url(item.get('descriptionurl'),{'commons.wikimedia.org'})
        if not src or not link or src in seen:continue
        metadata=item.get('extmetadata',{}) if isinstance(item.get('extmetadata'),dict) else {}
        artist=metadata.get('Artist',{}) if isinstance(metadata.get('Artist'),dict) else {}
        license_name=metadata.get('LicenseShortName',{}) if isinstance(metadata.get('LicenseShortName'),dict) else {}
        result.append({'src':src,'link':link,'photographer':plain_html(artist.get('value')) or 'Wikimedia Commons contributor','source':'Wikimedia Commons','license':plain_html(license_name.get('value'),40)})
        seen.add(src)
        if len(result)>=limit:break
    return result

def finite(value, low, high, label):
    try: value = float(value)
    except (TypeError, ValueError): raise ValueError(f'Enter a valid {label}.')
    if not math.isfinite(value) or not low <= value <= high: raise ValueError(f'{label.capitalize()} must be between {low} and {high}.')
    return value

def listen_options(data):
    band=data.get('band','airband')
    if band=='airband':
        frequency=finite(data.get('frequency'),118,136.975,'airband frequency')
    elif band=='weather':
        frequency=finite(data.get('frequency'),162.4,162.55,'weather frequency')
        if frequency not in WEATHER_CHANNELS:raise ValueError('Choose one of the seven NOAA weather channels.')
    else:raise ValueError('Choose aircraft AM or NOAA weather FM.')
    return {'frequency':frequency,'band':band}

def listen_command(options):
    weather=options['band']=='weather'
    args=['rtl_fm','-d',SERIAL,'-M','fm' if weather else 'am','-f',str(round(options['frequency']*1e6)),'-s','24000','-l','0','-E','dc']
    if weather:args+=['-g','29.7','-E','deemp']
    return args+['-']

def distance_bearing(lat1, lon1, lat2, lon2):
    a,b,c,d = map(math.radians,(lat1,lon1,lat2,lon2))
    h = math.sin((c-a)/2)**2 + math.cos(a)*math.cos(c)*math.sin((d-b)/2)**2
    dist = 3440.065*2*math.asin(min(1,math.sqrt(h)))
    bearing = math.degrees(math.atan2(math.sin(d-b)*math.cos(c), math.cos(a)*math.sin(c)-math.sin(a)*math.cos(c)*math.cos(d-b)))%360
    return round(dist,2),round(bearing)

def run(args):
    return subprocess.run(args, capture_output=True, text=True, timeout=15)

class Observatory:
    def __init__(self, state=STATE, start=True):
        self.state=Path(state); self.state.mkdir(parents=True,exist_ok=True)
        self.media=self.state/'media'; self.media.mkdir(exist_ok=True)
        self.lock=threading.RLock(); self.stop=threading.Event(); self.processes=[]; self.log_handle=None
        self.mode='aircraft'; self.since=time.time(); self.until=None; self.switching=False; self.error=None; self.options={}
        self.session_id=None; self.aircraft=[]; self.source_age=None; self.events=collections.deque(maxlen=30)
        self.enrichment_cache={}
        self.passes={'passes':[],'message':'Loading orbital predictions…'}
        defaults=read_json(ORIGINAL/'settings.json',{})
        self.settings=read_json(self.state/'settings.json', {'name':'Skyglow','latitude':defaults.get('latitude'), 'longitude':defaults.get('longitude'),'alert_nm':5})
        self.login=LoginStore(self.state)
        self.push_queue=queue.Queue(maxsize=64)
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives import serialization
        self.vapid_path=self.state/'vapid.pem'
        if not self.vapid_path.exists():
            key=ec.generate_private_key(ec.SECP256R1())
            self.vapid_path.write_bytes(key.private_bytes(serialization.Encoding.PEM,serialization.PrivateFormat.PKCS8,serialization.NoEncryption()))
            self.vapid_path.chmod(0o600)
        key=serialization.load_pem_private_key(self.vapid_path.read_bytes(),password=None)
        self.vapid_public=base64.urlsafe_b64encode(key.public_key().public_bytes(serialization.Encoding.X962,serialization.PublicFormat.UncompressedPoint)).rstrip(b'=').decode()
        self.dbfile=self.state/'skyglow.sqlite'
        with self.db() as db:
            db.executescript('''PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS positions(t INTEGER,hex TEXT,flight TEXT,lat REAL,lon REAL,alt REAL,speed REAL,track REAL,distance REAL);
            CREATE INDEX IF NOT EXISTS positions_t ON positions(t);
            CREATE INDEX IF NOT EXISTS positions_hex_t ON positions(hex,t);
            CREATE TABLE IF NOT EXISTS sensors(id TEXT PRIMARY KEY,model TEXT,last REAL,data TEXT);
            CREATE TABLE IF NOT EXISTS sensor_history(t INTEGER,id TEXT,data TEXT);
            CREATE INDEX IF NOT EXISTS sensor_history_id_t ON sensor_history(id,t);
            CREATE TABLE IF NOT EXISTS captures(id TEXT PRIMARY KEY,started REAL,ended REAL,status TEXT,frequency REAL);
            CREATE TABLE IF NOT EXISTS alerts(t REAL,hex TEXT,flight TEXT,distance REAL,alt REAL);
            CREATE INDEX IF NOT EXISTS alerts_t ON alerts(t);
            CREATE TABLE IF NOT EXISTS records(name TEXT PRIMARY KEY,value REAL,detail TEXT);
            CREATE TABLE IF NOT EXISTS subscriptions(endpoint TEXT PRIMARY KEY,data TEXT);
            PRAGMA optimize;''')
        self.alerted={}; self.last_save=0; self.last_cleanup=0; self.last_pass=0
        if start:
            self.restore_aircraft()
            threading.Thread(target=self.collect,daemon=True).start()
            threading.Thread(target=self.predict_loop,daemon=True).start()
            threading.Thread(target=self.push_worker,daemon=True).start()

    def db(self):
        db=sqlite3.connect(self.dbfile, timeout=15); db.row_factory=sqlite3.Row; return db

    def event(self,text): self.events.appendleft({'t':time.time(),'text':text})

    def cached_remote_json(self, key, url, ttl):
        now=time.time()
        with self.lock:
            cached=self.enrichment_cache.get(key)
            if cached and cached[0]>now:return cached[1]
        try:
            request=urllib.request.Request(url,headers={'Accept':'application/json','User-Agent':ENRICHMENT_USER_AGENT})
            with urllib.request.urlopen(request,timeout=8) as response:
                if response.headers.get('Content-Length') and int(response.headers['Content-Length'])>524288:
                    raise ValueError('Metadata response is too large.')
                data=json.loads(response.read(524289))
                if not isinstance(data,dict):data={}
            expires=now+ttl
        except (OSError,ValueError,urllib.error.HTTPError,urllib.error.URLError):
            data={};expires=now+300
        with self.lock:
            if len(self.enrichment_cache)>500:
                self.enrichment_cache={k:v for k,v in self.enrichment_cache.items() if v[0]>now}
            self.enrichment_cache[key]=(expires,data)
        return data

    def aircraft_details(self, hex_code, callsign=''):
        hex_code=text_value(hex_code,7).lower()
        callsign=text_value(callsign,10).upper().replace(' ','')
        if not re.fullmatch(r'[0-9a-f]{6}',hex_code):raise ValueError('Enter a six-character ICAO address.')
        if callsign and not re.fullmatch(r'[A-Z0-9]{2,8}',callsign):callsign=''
        requests={
            'aircraft':(f'aircraft:{hex_code}',f'https://api.adsbdb.com/v0/aircraft/{quote(hex_code)}',604800),
            'photo':(f'photo:{hex_code}',f'https://api.planespotters.net/pub/photos/hex/{quote(hex_code)}',86400),
        }
        if callsign:requests['route']=(f'route:{callsign}',f'https://api.adsbdb.com/v0/callsign/{quote(callsign)}',21600)
        with concurrent.futures.ThreadPoolExecutor(max_workers=len(requests)) as pool:
            futures={name:pool.submit(self.cached_remote_json,*spec) for name,spec in requests.items()}
            remote={name:future.result() for name,future in futures.items()}
        aircraft_response=remote.get('aircraft',{}).get('response',{})
        route_response=remote.get('route',{}).get('response',{})
        raw_aircraft=aircraft_response.get('aircraft',{}) if isinstance(aircraft_response,dict) else {}
        raw_route=route_response.get('flightroute',{}) if isinstance(route_response,dict) else {}
        aircraft=None
        if isinstance(raw_aircraft,dict) and raw_aircraft:
            aircraft={k:text_value(raw_aircraft.get(k)) for k in ('type','icao_type','manufacturer','mode_s','registration','registered_owner_country_iso_name','registered_owner_country_name','registered_owner_operator_flag_code','registered_owner')}
            aircraft['photo']=safe_remote_url(raw_aircraft.get('url_photo'),{'image.airport-data.com'})
        route=None
        if isinstance(raw_route,dict) and raw_route:
            route={k:text_value(raw_route.get(k)) for k in ('callsign','callsign_icao','callsign_iata')}
            airline=raw_route.get('airline',{})
            route['airline']={k:text_value(airline.get(k)) for k in ('name','icao','iata','country','country_iso','callsign')} if isinstance(airline,dict) else None
            for end in ('origin','destination'):
                airport=raw_route.get(end,{})
                if not isinstance(airport,dict):route[end]=None;continue
                route[end]={k:text_value(airport.get(k)) for k in ('country_iso_name','country_name','iata_code','icao_code','municipality','name')}
                for key in ('elevation','latitude','longitude'):
                    route[end][key]=airport.get(key) if isinstance(airport.get(key),(int,float)) else None
        photos=photo_records(remote.get('photo',{}))
        registration=aircraft.get('registration','').upper() if aircraft else ''
        if len(photos)<6 and re.fullmatch(r'[A-Z0-9-]{2,12}',registration):
            commons_url='https://commons.wikimedia.org/w/api.php?'+urlencode({'action':'query','generator':'search','gsrsearch':f'intitle:"{registration}" filetype:bitmap','gsrnamespace':6,'gsrlimit':10,'prop':'imageinfo','iiprop':'url|extmetadata','iiurlwidth':720,'format':'json','formatversion':2})
            commons=self.cached_remote_json(f'commons:{registration}',commons_url,86400)
            photos+=commons_photo_records(commons,registration,6-len(photos))
        if not photos and aircraft and aircraft.get('photo'):
            photos=[{'src':aircraft['photo'],'link':aircraft['photo'],'photographer':'','source':'Airport Data','license':''}]
        photo=photos[0] if photos else None
        return {'hex':hex_code.upper(),'callsign':callsign,'aircraft':aircraft,'route':route,'photo':photo,'photos':photos}

    def aircraft_thumbnails(self):
        with self.lock:hex_codes=[text_value(item.get('hex'),7).lower() for item in self.aircraft[:20]]
        with self.db() as db:hex_codes += [text_value(row['hex'],7).lower() for row in db.execute('SELECT hex FROM alerts ORDER BY t DESC LIMIT 12')]
        unique=[]
        for hex_code in hex_codes:
            if re.fullmatch(r'[0-9a-f]{6}',hex_code) and hex_code not in unique:unique.append(hex_code)
        if not unique:return {'photos':{}}
        with concurrent.futures.ThreadPoolExecutor(max_workers=min(8,len(unique))) as pool:
            futures={hex_code:pool.submit(self.cached_remote_json,f'photo:{hex_code}',f'https://api.planespotters.net/pub/photos/hex/{quote(hex_code)}',86400) for hex_code in unique}
            photos={hex_code.upper():photo for hex_code,future in futures.items() if (photo:=photo_record(future.result(),large=False))}
        return {'photos':photos}

    def save_settings(self, data):
        updated={'name':str(data.get('name','Skyglow')).strip()[:60] or 'Skyglow',
                 'latitude':finite(data.get('latitude'),-90,90,'latitude'),
                 'longitude':finite(data.get('longitude'),-180,180,'longitude'),
                 'alert_nm':finite(data.get('alert_nm',5),0.5,100,'alert radius')}
        with self.lock:
            self.settings=updated; (self.state/'settings.json').write_text(json.dumps(updated)); self.last_pass=0
        return updated

    def restore_aircraft(self):
        if run(['launchctl','print',AIR_LABEL]).returncode:
            result=run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(AIR_PLIST)])
            if result.returncode and run(['launchctl','print',AIR_LABEL]).returncode:
                raise RuntimeError('Aircraft receiver could not restart. Check the Mac receiver service.')

    def stop_processes(self):
        for p in self.processes:
            if p.poll() is None:
                try: os.killpg(p.pid,signal.SIGINT)
                except ProcessLookupError: pass
        for p in self.processes:
            try: p.wait(timeout=12)
            except subprocess.TimeoutExpired:
                try: os.killpg(p.pid,signal.SIGTERM); p.wait(timeout=5)
                except (ProcessLookupError,subprocess.TimeoutExpired):
                    try: os.killpg(p.pid,signal.SIGKILL)
                    except ProcessLookupError: pass
        self.processes=[]
        if self.log_handle: self.log_handle.close(); self.log_handle=None
        if self.session_id:
            capture_id=self.session_id;folder=self.media/'captures'/capture_id
            files=[p for p in folder.rglob('*.cadu') if p.stat().st_size>0]
            status='processing' if files else 'no_image'
            with self.db() as db: db.execute('UPDATE captures SET ended=?,status=? WHERE id=?',(time.time(),status,capture_id))
            if files:threading.Thread(target=self.decode_capture,args=(capture_id,files[0]),daemon=True).start()
            self.session_id=None

    def decode_capture(self,capture_id,source):
        folder=self.media/'captures'/capture_id
        try:
            with open(folder/'decode.log','wb') as log:
                # Product decoding no longer holds the SDR; aircraft reception can resume immediately.
                result=subprocess.run(['satdump','meteor_m2-x_lrpt','cadu',str(source),str(folder),'--satellite_number','M2-4'],cwd='/Applications/SatDump.app/Contents/Resources',stdout=log,stderr=log,timeout=300)
            images=list(folder.rglob('*.png'))+list(folder.rglob('*.jpg'))
            status='decoded' if images else 'no_image' if result.returncode==0 else 'decode_failed'
        except Exception:status='decode_failed'
        with self.db() as db:db.execute('UPDATE captures SET status=? WHERE id=?',(status,capture_id))

    def switch(self,mode,data):
        if mode not in MODES: raise ValueError('Choose Aircraft, Listen, Space, or Sensors.')
        opts={}; duration=finite(data.get('minutes',15),1,60,'session length')*60
        if mode=='listen':
            opts=listen_options(data)
            needed=['rtl_fm','ffmpeg']
        elif mode=='satellite':
            frequency=finite(data.get('frequency',137.1),137,138,'satellite frequency')
            rate=str(data.get('rate','72'))
            if rate not in ('72','80'): raise ValueError('Choose 72k or 80k satellite decoding.')
            opts={'frequency':frequency,'rate':rate}; needed=['satdump']
            duration=min(duration,1200)
            if shutil.disk_usage(self.state).free<2*1024**3: raise ValueError('Free at least 2 GB on your Mac before capturing satellite data.')
        elif mode=='sensors':
            frequency=finite(data.get('frequency',433.92),300,930,'sensor frequency')
            if frequency not in (315,345,433.92,868.3,915): raise ValueError('Choose a supported sensor band.')
            opts={'frequency':frequency}; needed=['rtl_433']
        else: needed=[]
        for name in needed:
            if not shutil.which(name): raise ValueError(f'{name} is not installed on the Mac.')
        with self.lock:
            if self.switching: raise ValueError('The receiver is already switching. Try again in a moment.')
            self.switching=True; self.error=None
        try:
            self.stop_processes()
            if mode=='aircraft': self.restore_aircraft()
            else:
                if not run(['launchctl','print',AIR_LABEL]).returncode:
                    result=run(['launchctl','bootout',AIR_LABEL])
                    if result.returncode: raise RuntimeError('Could not pause the aircraft receiver.')
                time.sleep(1)
                self.log_handle=open(self.state/'receiver.log','wb')
                if mode=='listen':
                    out=self.media/'audio'; shutil.rmtree(out,ignore_errors=True);out.mkdir()
                    audio_id=secrets.token_hex(6)
                    radio=subprocess.Popen(listen_command(opts),stdout=subprocess.PIPE,stderr=self.log_handle,start_new_session=True)
                    self.processes.append(radio)
                    encoder=subprocess.Popen(['ffmpeg','-hide_banner','-loglevel','warning','-f','s16le','-ar','24000','-ac','1','-i','pipe:0','-af','highpass=f=200,lowpass=f=3500','-c:a','aac','-b:a','48k','-f','hls','-hls_time','2','-hls_list_size','6','-hls_flags','delete_segments+omit_endlist+temp_file','-hls_segment_filename',str(out/f'segment-{audio_id}-%06d.ts'),str(out/'live.m3u8')],stdin=radio.stdout,stdout=subprocess.DEVNULL,stderr=self.log_handle,start_new_session=True)
                    radio.stdout.close(); self.processes.append(encoder)
                elif mode=='sensors':
                    p=subprocess.Popen(['rtl_433','-d',':'+SERIAL,'-f',str(int(opts['frequency']*1e6)),'-F','json','-M','time:unix','-C','si'],stdout=subprocess.PIPE,stderr=self.log_handle,text=True,start_new_session=True)
                    self.processes=[p];threading.Thread(target=self.sensor_reader,args=(p,),daemon=True).start()
                else:
                    self.session_id=dt.datetime.now(dt.timezone.utc).strftime('%Y%m%dT%H%M%S')+'-'+secrets.token_hex(3)
                    out=self.media/'captures'/self.session_id;out.mkdir(parents=True)
                    with self.db() as db:db.execute('INSERT INTO captures VALUES(?,?,NULL,?,?)',(self.session_id,time.time(),'capturing',opts['frequency']))
                    pipeline='meteor_m2-x_lrpt' if opts['rate']=='72' else 'meteor_m2-x_lrpt_80k'
                    p=subprocess.Popen(['satdump','live',pipeline,str(out),'--source','rtlsdr','--source_id',SERIAL,'--samplerate','1024000','--frequency',str(int(opts['frequency']*1e6)),'--gain','40','--dc_block','--timeout',str(int(duration))],cwd='/Applications/SatDump.app/Contents/Resources',stdout=self.log_handle,stderr=self.log_handle,start_new_session=True)
                    self.processes=[p]
                time.sleep(2)
                if any(p.poll() is not None for p in self.processes): raise RuntimeError('Receiver could not start this mode. Aircraft reception has been restored; see Station for details.')
            with self.lock:
                self.mode=mode;self.since=time.time();self.until=self.since+duration if mode!='aircraft' else None;self.options=opts
            self.event(f'Reception switched to {mode}.')
        except Exception as e:
            self.stop_processes()
            try: self.restore_aircraft()
            except Exception as restore: self.error=str(restore)
            self.mode='aircraft';self.until=None;self.options={};self.error=self.error or str(e);self.event(self.error)
            raise
        finally:
            with self.lock:self.switching=False

    def sensor_reader(self,p):
        try:
            for line in p.stdout:
                try:
                    data=json.loads(line)
                    if not isinstance(data,dict) or not data.get('model'):continue
                    sid=str(data['model'])+':'+str(data.get('id',data.get('channel','unknown')))
                    now=time.time();payload=json.dumps(data,allow_nan=False)
                    with self.db() as db:
                        db.execute('INSERT OR REPLACE INTO sensors VALUES(?,?,?,?)',(sid,str(data['model']),now,payload))
                        db.execute('INSERT INTO sensor_history VALUES(?,?,?)',(int(now),sid,payload))
                except (ValueError,sqlite3.Error):continue
        finally:
            p.stdout.close()

    def collect(self):
        while not self.stop.is_set():
            try:
                now=time.time()
                if not self.switching and self.mode!='aircraft' and ((self.until and now>=self.until) or any(p.poll() is not None for p in self.processes)):
                    self.event('Session finished. Returning to aircraft reception.');self.switch('aircraft',{})
                raw=read_json(ORIGINAL/'readsb/aircraft.json',{})
                self.source_age=now-raw.get('now',0) if raw.get('now') else None
                fresh=self.mode=='aircraft' and not self.switching and self.source_age is not None and self.source_age<20
                aircraft=[]
                if fresh:
                    for a in raw.get('aircraft',[]):
                        if a.get('seen',999)>15:continue
                        loc=all(isinstance(a.get(k),(int,float)) for k in ('lat','lon')) and a.get('seen_pos',999)<15
                        item={'hex':a.get('hex',''),'flight':str(a.get('flight','')).strip(),'alt':a.get('alt_baro'),'alt_geom':a.get('alt_geom'),'speed':a.get('gs'),'ias':a.get('ias'),'tas':a.get('tas'),'mach':a.get('mach'),'track':a.get('track'),'track_rate':a.get('track_rate'),'mag_heading':a.get('mag_heading'),'true_heading':a.get('true_heading'),'baro_rate':a.get('baro_rate'),'geom_rate':a.get('geom_rate'),'squawk':a.get('squawk'),'emergency':a.get('emergency'),'category':a.get('category'),'nav_qnh':a.get('nav_qnh'),'nav_altitude':a.get('nav_altitude_mcp') or a.get('nav_altitude_fms'),'nav_heading':a.get('nav_heading'),'nav_modes':a.get('nav_modes') if isinstance(a.get('nav_modes'),list) else [],'registration':a.get('r'),'aircraft_type':a.get('t'),'description':a.get('desc'),'operator':a.get('ownOp'),'source':a.get('type'),'messages':a.get('messages'),'seen':a.get('seen'),'seen_pos':a.get('seen_pos'),'lat':a.get('lat') if loc else None,'lon':a.get('lon') if loc else None,'distance':None,'bearing':None,'rssi':a.get('rssi')}
                        if loc and self.settings.get('latitude') is not None:
                            item['distance'],item['bearing']=distance_bearing(self.settings['latitude'],self.settings['longitude'],a['lat'],a['lon'])
                        aircraft.append(item)
                self.aircraft=sorted(aircraft,key=lambda a:a['distance'] if a['distance'] is not None else 1e6)
                if now-self.last_save>=10:
                    self.last_save=now
                    with self.db() as db:
                        for a in aircraft:
                            if a['lat'] is None:continue
                            alt=a['alt'] if isinstance(a['alt'],(int,float)) else 0 if a['alt']=='ground' else None
                            db.execute('INSERT INTO positions VALUES(?,?,?,?,?,?,?,?,?)',(int(now),a['hex'],a['flight'],a['lat'],a['lon'],alt,a['speed'],a['track'],a['distance']))
                            if a['distance'] is not None:
                                db.execute("INSERT INTO records VALUES('farthest',?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value,detail=excluded.detail WHERE excluded.value>records.value",(a['distance'],json.dumps({'flight':a['flight'] or a['hex'],'t':int(now)})))
                            if a['distance'] is not None and a['distance']<=self.settings.get('alert_nm',5) and now-self.alerted.get(a['hex'],0)>900:
                                self.alerted[a['hex']]=now
                                db.execute('INSERT INTO alerts VALUES(?,?,?,?,?)',(now,a['hex'],a['flight'],a['distance'],alt))
                                try:self.push_queue.put_nowait({'title':a['flight'] or a['hex'].upper(),'body':f"{a['distance']:.1f} nautical miles from your receiver"+(f" · {alt:,.0f} ft" if alt is not None else ''),'tag':'aircraft-'+a['hex']})
                                except queue.Full:pass
                        if now-self.last_cleanup>3600:
                            self.last_cleanup=now
                            db.execute('DELETE FROM positions WHERE t<?',(now-7*86400,));db.execute('DELETE FROM sensor_history WHERE t<?',(now-7*86400,));db.execute('DELETE FROM alerts WHERE t<?',(now-7*86400,))
                            self.alerted={k:v for k,v in self.alerted.items() if now-v<3600}
                            for folder in (self.media/'captures').glob('*'):
                                if folder.is_dir() and now-folder.stat().st_mtime>30*86400:shutil.rmtree(folder)
            except Exception as e:
                self.event('Collector: '+str(e)[:180])
            self.stop.wait(2)

    def predict_loop(self):
        while not self.stop.is_set():
            if time.time()-self.last_pass>1800:
                self.last_pass=time.time()
                try:self.predict()
                except Exception as e:self.passes={'passes':[],'message':'Pass predictions unavailable: '+str(e)[:120]}
            self.stop.wait(5)

    def push_worker(self):
        from pywebpush import webpush, WebPushException
        while not self.stop.is_set():
            try:message=self.push_queue.get(timeout=2)
            except queue.Empty:continue
            with self.db() as db:subs=db.execute('SELECT endpoint,data FROM subscriptions').fetchall()
            for sub in subs:
                try:webpush(subscription_info=json.loads(sub['data']),data=json.dumps(message),vapid_private_key=str(self.vapid_path),vapid_claims={'sub':PUBLIC},ttl=60,timeout=10)
                except WebPushException as e:
                    if e.response is not None and e.response.status_code in (404,410):
                        with self.db() as db:db.execute('DELETE FROM subscriptions WHERE endpoint=?',(sub['endpoint'],))
                except Exception:pass

    def predict(self):
        from skyfield.api import EarthSatellite, load, wgs84
        if self.settings.get('latitude') is None:
            self.passes={'passes':[],'message':'Set your station location to predict satellite passes.'};return
        tle=self.state/'meteor.tle'
        if not tle.exists() or time.time()-tle.stat().st_mtime>21600:
            request=urllib.request.Request('https://celestrak.org/NORAD/elements/gp.php?CATNR=59051&FORMAT=TLE',headers={'User-Agent':'Skyglow/1.0'})
            try:
                data=urllib.request.urlopen(request,timeout=20).read().decode()
                if '\n1 59051' not in data or '\n2 59051' not in data:raise ValueError('Orbital data source returned invalid data')
                tle.write_text(data)
            except Exception:
                if not tle.exists():raise
        lines=tle.read_text().strip().splitlines();ts=load.timescale();sat=EarthSatellite(lines[-2],lines[-1],'Meteor-M2 4',ts)
        start=ts.now();end=ts.from_datetime(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=2))
        age=abs(float(start-sat.epoch))
        if age>14:
            self.passes={'passes':[],'message':'Orbital data is more than 14 days old. Predictions paused until it refreshes.'};return
        observer=wgs84.latlon(self.settings['latitude'],self.settings['longitude'])
        times,events=sat.find_events(observer,start,end,altitude_degrees=10)
        passes=[];current=None
        for t,event in zip(times,events):
            stamp=t.utc_datetime().timestamp()
            if event==0:current={'rise':stamp,'name':'Meteor-M2 4'}
            elif event==1 and current:
                alt,az,_=(sat-observer).at(t).altaz();current.update(peak=stamp,elevation=round(alt.degrees),azimuth=round(az.degrees))
            elif event==2 and current and 'peak' in current:
                current['set']=stamp;passes.append(current);current=None
        self.passes={'passes':passes[:10],'updated':time.time(),'epoch':sat.epoch.utc_datetime().timestamp(),'message':'Passes above 10° • times shown in your local time zone','tle_age_days':round(age,1)}

    def snapshot(self):
        now=time.time()
        with self.db() as db:
            total=db.execute('SELECT COUNT(DISTINCT hex) n,MIN(t) first FROM positions WHERE t>?',(now-86400,)).fetchone()
            record=db.execute("SELECT value,detail FROM records WHERE name='farthest'").fetchone()
            alerts=[dict(r) for r in db.execute('SELECT * FROM alerts ORDER BY t DESC LIMIT 25')]
            sensors=[{**dict(r),'data':json.loads(r['data'])} for r in db.execute('SELECT * FROM sensors ORDER BY last DESC LIMIT 100')]
            captures=[dict(r) for r in db.execute('SELECT * FROM captures ORDER BY started DESC LIMIT 30')]
        for c in captures:
            folder=self.media/'captures'/c['id'];images=[]
            if folder.exists():
                for p in sorted(folder.rglob('*')):
                    if p.suffix.lower() in ('.png','.jpg','.jpeg') and p.stat().st_size>1000:
                        images.append({'url':'/media/'+p.relative_to(self.media).as_posix(),'name':p.stem})
            c['images']=images[:24]
        with self.lock:
            receiver={'mode':self.mode,'since':self.since,'until':self.until,'switching':self.switching,'error':self.error,'options':self.options,'audio_ready':self.mode=='listen' and (self.media/'audio/live.m3u8').exists()}
        return {'now':now,'receiver':receiver,'settings':self.settings,'aircraft':self.aircraft,'source_age':self.source_age,
                'stats':{'aircraft_24h':total['n'],'first_record':total['first'],'farthest_nm':record['value'] if record else None,'farthest_detail':json.loads(record['detail']) if record else None},
                'alerts':alerts,'sensors':sensors,'captures':captures,'orbital':self.passes,'events':list(self.events),
                'tools':{n:bool(shutil.which(n)) for n in ('readsb','rtl_fm','ffmpeg','rtl_433','satdump')}}

    def replay(self,start,end):
        start=finite(start,0,time.time()+86400,'start time');end=finite(end,start,min(start+86400,time.time()+86400),'end time')
        with self.db() as db:
            # Retain one point per aircraft per minute for a bounded mobile response.
            rows=db.execute('SELECT t,hex,flight,lat,lon,alt,speed,track,distance FROM positions WHERE t>=? AND t<? GROUP BY hex,CAST(t/60 AS INTEGER) ORDER BY t LIMIT 60001',(start,end)).fetchall()
        return {'points':[list(r) for r in rows[:60000]],'truncated':len(rows)>60000,'start':start,'end':end,'sample_seconds':60}

    def shutdown(self):
        self.stop.set()
        while self.switching:time.sleep(.1)
        self.stop_processes();self.restore_aircraft()

class Handler(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args):pass
    @property
    def app(self):return self.server.app

    def local(self):
        host=urlparse('//'+self.headers.get('Host','')).hostname
        return host in ('localhost','127.0.0.1','::1') and self.client_address[0] in ('127.0.0.1','::1') and not any(self.headers.get(k) for k in ('CF-Connecting-IP','Forwarded','X-Forwarded-For','X-Forwarded-Host','CF-Ray'))

    def valid_host(self):return self.headers.get('Host','') in ('localhost:'+str(self.server.server_port),'127.0.0.1:'+str(self.server.server_port),'skyglow.ramideltoro.com')
    def valid_origin(self):
        expected='http://'+self.headers.get('Host','') if self.local() else PUBLIC
        return self.headers.get('Origin')==expected

    def session_token(self):
        cookie=http.cookies.SimpleCookie()
        try:cookie.load(self.headers.get('Cookie',''));token=cookie.get('skyglow_session')
        except http.cookies.CookieError:return None
        return token.value if token else None

    def authorized(self):return self.app.login.account.get('username')==OWNER_USERNAME and self.app.login.authenticated(self.session_token())

    def session_cookie(self,token,clear=False):
        return f'skyglow_session={token}; HttpOnly; Path=/; SameSite=Strict; Max-Age={0 if clear else 2592000}'+('' if self.local() else '; Secure')

    def send(self,status,data,content_type='application/json',headers=None):
        body=json.dumps(data,allow_nan=False).encode() if content_type=='application/json' and not isinstance(data,bytes) else data
        self.send_response(status);self.send_header('Content-Type',content_type);self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','strict-origin-when-cross-origin');self.send_header('X-Frame-Options','DENY')
        for k,v in (headers or {}).items():self.send_header(k,v)
        self.end_headers()
        try:self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError):pass

    def do_GET(self):
        if not self.valid_host():return self.send(403,{'error':'Unrecognized host.'})
        u=urlparse(self.path);path=unquote(u.path);q=parse_qs(u.query)
        try:
            if path=='/api/session':return self.send(200,{'authenticated':self.authorized()})
            authorized=self.authorized()
            if path in ('/api/push-key','/api/receiver-log') and not authorized:return self.send(401,{'error':'Owner sign-in required.'})
            if path=='/api/snapshot':
                data=self.app.snapshot();data.update(can_control=authorized,local=self.local(),username=OWNER_USERNAME if authorized else '');return self.send(200,data)
            if path=='/api/health':return self.send(200,{'service':'skyglow','mode':self.app.mode})
            if path=='/api/push-key':return self.send(200,{'key':self.app.vapid_public})
            if path=='/api/aircraft-details':return self.send(200,self.app.aircraft_details(q.get('hex',[''])[0],q.get('callsign',[''])[0]))
            if path=='/api/aircraft-thumbnails':return self.send(200,self.app.aircraft_thumbnails())
            if path=='/api/replay':
                now=time.time();return self.send(200,self.app.replay(q.get('start',[now-86400])[0],q.get('end',[now])[0]))
            if path=='/api/sensor-history':
                sid=q.get('id',[''])[0]
                with self.app.db() as db:rows=db.execute('SELECT t,data FROM sensor_history WHERE id=? AND t>? ORDER BY t DESC LIMIT 150',(sid,time.time()-86400)).fetchall()
                return self.send(200,{'readings':[{'t':r['t'],'data':json.loads(r['data'])} for r in rows]})
            if path=='/api/receiver-log':
                p=self.app.state/'receiver.log';return self.send(200,{'text':p.read_text(errors='replace')[-5000:] if p.exists() else 'No radio session yet.'})
            if path.startswith('/api/'):return self.send(404,{'error':'Not found.'})
            if path.startswith('/media/'):
                root=self.app.media;target=(root/path.removeprefix('/media/')).resolve()
            else:
                root=ROOT/'dist/client';target=(root/('index.html' if path=='/' else path.lstrip('/'))).resolve()
            if not target.is_relative_to(root.resolve()) or not target.is_file():return self.send(404,{'error':'Not found.'})
            mime={'.m3u8':'application/vnd.apple.mpegurl','.ts':'video/mp2t','.webmanifest':'application/manifest+json'}.get(target.suffix,mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
            return self.send(200,target.read_bytes(),mime)
        except (ValueError,TypeError) as e:return self.send(400,{'error':str(e)})
        except Exception as e:return self.send(500,{'error':str(e)[:200]})

    def do_POST(self):
        if not self.valid_host() or not self.valid_origin():return self.send(403,{'error':'Open Skyglow directly to use these controls.'})
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=8192:return self.send(400,{'error':'Invalid request size.'})
            data=json.loads(self.rfile.read(size));path=urlparse(self.path).path
            if not isinstance(data,dict):raise ValueError('Expected a settings object.')
            if path=='/api/login':
                client=self.headers.get('CF-Connecting-IP',self.client_address[0])
                status,token=self.app.login.login(data.get('username'),data.get('password'),client)
                if text_value(data.get('username'),128)!=OWNER_USERNAME:status,token=401,None
                if status==429:return self.send(429,{'error':'Too many attempts. Try again in five minutes.'},headers={'Retry-After':'300'})
                if status!=200:return self.send(401,{'error':'Incorrect username or password.'})
                return self.send(200,{'authenticated':True},headers={'Set-Cookie':self.session_cookie(token)})
            if path=='/api/logout':
                self.app.login.logout(self.session_token())
                return self.send(200,{'authenticated':False},headers={'Set-Cookie':self.session_cookie('',clear=True)})
            if not self.authorized():return self.send(401,{'error':'Sign in to control the receiver.'})
            if path=='/api/push':
                endpoint=data.get('endpoint','');parsed=urlparse(endpoint);host=parsed.hostname or ''
                allowed=host in ('web.push.apple.com','fcm.googleapis.com','updates.push.services.mozilla.com') or host.endswith('.push.apple.com') or host.endswith('.push.services.mozilla.com')
                if parsed.scheme!='https' or parsed.port not in (None,443) or parsed.username or not allowed:raise ValueError('Unsupported push notification service.')
                with self.app.db() as db:
                    if data.get('remove'):db.execute('DELETE FROM subscriptions WHERE endpoint=?',(endpoint,))
                    else:
                        if not isinstance(data.get('keys'),dict) or not all(data['keys'].get(k) for k in ('p256dh','auth')):raise ValueError('Invalid notification subscription.')
                        db.execute('INSERT OR REPLACE INTO subscriptions VALUES(?,?)',(endpoint,json.dumps(data)))
                return self.send(200,{'saved':True})
            if path=='/api/mode':self.app.switch(data.get('mode'),data);return self.send(200,{'mode':self.app.mode})
            if path=='/api/settings':return self.send(200,self.app.save_settings(data))
            return self.send(404,{'error':'Not found.'})
        except (ValueError,TypeError) as e:return self.send(400,{'error':str(e)})
        except Exception as e:return self.send(500,{'error':str(e)[:200]})

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8790);args=parser.parse_args()
    os.environ['PATH']='/opt/homebrew/bin:/usr/bin:/bin:'+os.environ.get('PATH','')
    app=Observatory();server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.app=app;server.daemon_threads=True
    def stop(*_):
        threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    print(f'Skyglow ready at http://localhost:{args.port}',flush=True)
    try:server.serve_forever()
    finally:app.shutdown();server.server_close()

if __name__=='__main__':main()
