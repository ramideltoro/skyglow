"""Single-account login and revocable, per-browser sessions."""
import collections
import hashlib
import json
import os
from pathlib import Path
import secrets
import threading
import time


class LoginStore:
    def __init__(self, state):
        self.state = Path(state)
        self.lock = threading.RLock()
        self.account = self.read('account.json', {})
        self.sessions = self.read('login-sessions.json', {})
        self.failures = collections.defaultdict(list)

    def read(self, name, default):
        try:
            return json.loads((self.state / name).read_text())
        except (OSError, ValueError):
            return default

    def save(self, name, data):
        path = self.state / name
        temporary = path.with_suffix('.tmp')
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, 'w') as stream:
            json.dump(data, stream)
        os.replace(temporary, path)

    def configure(self, username, password):
        """Called locally during account setup; never exposed as a web endpoint."""
        salt = secrets.token_bytes(16)
        with self.lock:
            self.account = {
                'username': username,
                'salt': salt.hex(),
                'iterations': 600000,
                'password_hash': hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 600000).hex(),
            }
            self.sessions = {}
            self.save('account.json', self.account)
            self.save('login-sessions.json', self.sessions)

    def login(self, username, password, client):
        with self.lock:
            now = time.time()
            self.failures = collections.defaultdict(list, {
                key: [stamp for stamp in stamps if stamp > now - 300]
                for key, stamps in self.failures.items() if stamps and stamps[-1] > now - 300
            })
            if len(self.failures[client]) >= 10:
                return 429, None
            account = self.account
            if not account or not isinstance(username, str) or not isinstance(password, str) or len(username) > 128 or len(password) > 1024:
                self.failures[client].append(now)
                return 401, None
            candidate = hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(account['salt']), account['iterations']).hex()
            correct_password = secrets.compare_digest(candidate, account['password_hash'])
            correct_username = secrets.compare_digest(username.encode(), account['username'].encode())
            if not (correct_username and correct_password):
                self.failures[client].append(now)
                return 401, None
            self.failures.pop(client, None)
            token = secrets.token_urlsafe(32)
            self.sessions = {key: expiry for key, expiry in self.sessions.items() if expiry > now}
            self.sessions[hashlib.sha256(token.encode()).hexdigest()] = now + 30 * 86400
            self.save('login-sessions.json', self.sessions)
            return 200, token

    def authenticated(self, token):
        if not token:
            return False
        with self.lock:
            return self.sessions.get(hashlib.sha256(token.encode()).hexdigest(), 0) > time.time()

    def logout(self, token):
        with self.lock:
            if token:
                self.sessions.pop(hashlib.sha256(token.encode()).hexdigest(), None)
                self.save('login-sessions.json', self.sessions)
