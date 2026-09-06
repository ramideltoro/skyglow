import io,json,tempfile,threading,time,unittest,urllib.request,urllib.error
from types import SimpleNamespace
from unittest.mock import patch
from skyglow import Observatory, Handler, ThreadingHTTPServer, finite, distance_bearing, listen_options, listen_command

class RadioConfigurationTests(unittest.TestCase):
    def test_aircraft_and_weather_use_correct_demodulation(self):
        aircraft=listen_options({'frequency':126.45})
        weather=listen_options({'band':'weather','frequency':162.55})
        for options,modulation,hz in ((aircraft,'am','126450000'),(weather,'fm','162550000')):
            command=listen_command(options)
            self.assertEqual(command[command.index('-M')+1],modulation)
            self.assertEqual(command[command.index('-f')+1],hz)
        self.assertIn('deemp',listen_command(weather))
    def test_weather_channels_and_band_boundaries(self):
        for frequency in (162.4,162.425,162.45,162.475,162.5,162.525,162.55):
            self.assertEqual(listen_options({'band':'weather','frequency':frequency})['frequency'],frequency)
        for data in ({'frequency':162.55},{'band':'weather','frequency':126.45},{'band':'weather','frequency':162.51},{'band':'weather','frequency':'NaN'},{'band':'unknown','frequency':126.45}):
            with self.assertRaises(ValueError):listen_options(data)

class SkyglowTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.app=Observatory(self.tmp.name,start=False)
        self.app.login.configure('tester','test-password')
        _,token=self.app.login.login('tester','test-password','test-client');self.cookie='skyglow_session='+token
        self.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);self.server.app=self.app
        self.thread=threading.Thread(target=self.server.serve_forever,daemon=True);self.thread.start()
        self.base='http://127.0.0.1:'+str(self.server.server_port)
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.thread.join();self.tmp.cleanup()
    def request(self,path,data=None,remote=False,cookie=None,origin=None,signed_in=True):
        headers={'Origin':origin or ('https://skyglow.ramideltoro.com' if remote else self.base)}
        if remote:headers.update(Host='skyglow.ramideltoro.com',**{'CF-Connecting-IP':'203.0.113.20'})
        if cookie or signed_in:headers['Cookie']=cookie or self.cookie
        if data is not None:headers['Content-Type']='application/json'
        q=urllib.request.Request(self.base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers)
        try:
            with urllib.request.urlopen(q) as r:return r.status,json.load(r),r.headers
        except urllib.error.HTTPError as e:return e.code,json.load(e),e.headers
    def test_login_required_locally_and_remotely(self):
        for remote in (False,True):
            for path in ('/api/snapshot','/api/replay','/api/aircraft-details?hex=89649d','/api/receiver-log','/media/audio/live.m3u8','/media/captures/../audio/live.m3u8'):
                self.assertEqual(self.request(path,remote=remote,signed_in=False)[0],401)
            with patch.object(self.app,'switch') as switch:
                self.assertEqual(self.request('/api/mode',{'mode':'sensors'},remote=remote,signed_in=False)[0],401)
                switch.assert_not_called()
    def test_cross_origin_control_and_login_blocked(self):
        self.assertEqual(self.request('/api/settings',{},origin='https://untrusted.example')[0],403)
        self.assertEqual(self.request('/api/login',{'username':'tester','password':'test-password'},origin='https://untrusted.example',signed_in=False)[0],403)
    def test_shared_login_cookie_and_logout(self):
        status,_,headers=self.request('/api/login',{'username':'tester','password':'test-password'},remote=True,signed_in=False)
        self.assertEqual(status,200);cookie=headers['Set-Cookie'];self.assertIn('Secure',cookie);self.assertIn('HttpOnly',cookie)
        cookie=cookie.split(';')[0]
        _,snap,_=self.request('/api/snapshot',remote=True,cookie=cookie);self.assertTrue(snap['can_control']);self.assertEqual(snap['username'],'tester')
        with patch.object(self.app,'switch') as switch:
            self.assertEqual(self.request('/api/mode',{'mode':'aircraft'},remote=True,cookie=cookie)[0],200)
            switch.assert_called_once()
        self.assertEqual(self.request('/api/logout',{},remote=True,cookie=cookie)[0],200)
        self.assertEqual(self.request('/api/snapshot',remote=True,cookie=cookie)[0],401)
        self.assertEqual(self.request('/api/snapshot')[0],200)
    def test_only_configured_account_can_log_in(self):
        for user,password in [('tester','wrong'),('someone-else','test-password')]:
            self.assertEqual(self.request('/api/login',{'username':user,'password':password},signed_in=False)[0],401)
    def test_old_pairing_removed_and_old_cookie_ignored(self):
        self.assertEqual(self.request('/api/pair-code',{})[0],404)
        self.assertEqual(self.request('/api/pair',{'code':'123456'})[0],404)
        self.assertEqual(self.request('/api/snapshot',cookie='skyglow_control=old-pairing-token')[0],401)
    def test_login_rate_limit(self):
        for _ in range(10):
            self.assertEqual(self.request('/api/login',{'username':'tester','password':'wrong'},signed_in=False)[0],401)
        self.assertEqual(self.request('/api/login',{'username':'tester','password':'test-password'},signed_in=False)[0],429)
    def test_credentials_are_hashed_and_sessions_persist(self):
        from access import LoginStore
        store=LoginStore(self.tmp.name)
        self.assertTrue(store.authenticated(self.cookie.split('=',1)[1]))
        self.assertNotIn('test-password',(store.state/'account.json').read_text())
        self.assertEqual((store.state/'account.json').stat().st_mode & 0o777,0o600)
    def test_invalid_settings_do_not_mutate(self):
        previous=self.app.settings.copy()
        for lat in ('NaN',91,-91):
            self.assertEqual(self.request('/api/settings',{'latitude':lat,'longitude':0})[0],400)
        self.assertEqual(self.app.settings,previous)
    def test_invalid_radio_request_keeps_aircraft(self):
        with patch.object(self.app,'stop_processes') as stop:
            for data in [{'mode':'listen','frequency':900},{'mode':'listen','band':'weather','frequency':162.51},{'mode':'sensors','frequency':700},{'mode':'satellite','rate':'999'}]:
                with self.assertRaises(ValueError):self.app.switch(data['mode'],data)
            stop.assert_not_called();self.assertEqual(self.app.mode,'aircraft')
    def test_radio_failure_restores_aircraft(self):
        with patch('skyglow.shutil.which',return_value='/bin/tool'),patch('skyglow.run',side_effect=RuntimeError('USB failure')),patch.object(self.app,'stop_processes'),patch.object(self.app,'restore_aircraft') as restore:
            with self.assertRaises(RuntimeError):self.app.switch('listen',{'frequency':118})
            restore.assert_called_once();self.assertEqual(self.app.mode,'aircraft');self.assertFalse(self.app.switching)
    def test_sensor_reader_preserves_real_values(self):
        self.app.sensor_reader(SimpleNamespace(stdout=io.StringIO('not json\n'+json.dumps({'model':'Test thermometer','id':5,'temperature_C':22.7})+'\n')))
        snap=self.app.snapshot();self.assertEqual(snap['sensors'][0]['data']['temperature_C'],22.7)
    def test_replay_time_window_and_sampling(self):
        now=int(time.time());start=now-now%60-120
        with self.app.db() as db:
            for t in (start-10,start+1,start+10,start+61):db.execute('INSERT INTO positions VALUES(?,?,?,?,?,?,?,?,?)',(t,'abc','TEST',28,-82,10000,200,45,10))
        replay=self.app.replay(start,start+120);self.assertEqual(len(replay['points']),2)
        self.assertTrue(all(p[0]>=start for p in replay['points']))
        with self.assertRaises(ValueError):self.app.replay(start,start+86401)
    def test_aircraft_details_combines_registry_route_and_attributed_photo(self):
        def remote(key,*_):
            if key.startswith('aircraft:'):return {'response':{'aircraft':{'type':'A380 861','icao_type':'A388','manufacturer':'Airbus','mode_s':'89649D','registration':'A6-API','registered_owner_country_name':'United Arab Emirates','registered_owner':'Etihad Airways'}}}
            if key.startswith('route:'):return {'response':{'flightroute':{'callsign':'ETD1','callsign_iata':'EY1','airline':{'name':'Etihad Airways','iata':'EY'},'origin':{'iata_code':'AUH','name':'Zayed International Airport','latitude':24.43,'longitude':54.65},'destination':{'iata_code':'JFK','name':'John F. Kennedy International Airport','latitude':40.64,'longitude':-73.78}}}}
            return {'photos':[{'thumbnail_large':{'src':'https://t.plnspttrs.net/photo.jpg'},'link':'https://www.planespotters.net/photo/1','photographer':'A Spotter'}]}
        with patch.object(self.app,'cached_remote_json',side_effect=remote):details=self.app.aircraft_details('89649d',' ETD1 ')
        self.assertEqual(details['aircraft']['registration'],'A6-API')
        self.assertEqual(details['route']['origin']['iata_code'],'AUH')
        self.assertEqual(details['photo']['photographer'],'A Spotter')
        with patch.object(self.app,'cached_remote_json',return_value={'response':'unknown aircraft'}):unknown=self.app.aircraft_details('000001')
        self.assertIsNone(unknown['aircraft']);self.assertIsNone(unknown['route']);self.assertIsNone(unknown['photo'])
        with self.assertRaises(ValueError):self.app.aircraft_details('../etc/passwd','ETD1')
    def test_distance(self):
        distance,bearing=distance_bearing(0,0,1,0);self.assertAlmostEqual(distance,60.04,places=1);self.assertEqual(bearing,0)

if __name__=='__main__':unittest.main()
