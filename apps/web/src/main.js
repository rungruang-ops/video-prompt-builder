import './styles.css';
import { api } from './api.js';
import { showAuth } from './auth.js';
import { startApp } from './app.js';

async function boot() {
  try {
    const s = await api.get('/auth/session');
    if (s.user) return startApp({ user: s.user });
    showAuth({ cfg: s.config, serverDown: false, onAuthed: user => startApp({ user }), onOffline: () => startApp({ offline: true }) });
  } catch (e) {
    const serverDown = e.status === 0 || e.status >= 500;
    const cfg = serverDown ? {} : await api.get('/auth/config').catch(() => ({}));
    showAuth({ cfg, serverDown, onAuthed: user => startApp({ user }), onOffline: () => startApp({ offline: true }) });
  }
}
boot();
