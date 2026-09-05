import { supabase } from '../../lib/supabaseClient';

// One channel; no table rows or officer/medical fields are broadcast to public clients.
const listeners = new Map();
let channel;
let expiryTimer;
const emit = (event, options) => { for (const [callback, kind] of listeners) if (kind === event) callback(options); };
function subscribe(listener, event) {
  listeners.set(listener, event);
  if (!channel && supabase) {
    let connected = false;
    expiryTimer = setInterval(() => emit('stale', { invalidateCache: false }), 10 * 60_000);
    channel = supabase.channel('public-data-invalidations', { config: { private: false } })
      .on('broadcast', { event: 'stale' }, () => emit('stale'))
      .on('broadcast', { event: 'advisory' }, () => emit('advisory'))
      .subscribe(status => {
        if (status === 'SUBSCRIBED') {
          if (connected) { emit('stale'); emit('advisory'); }
          connected = true;
        }
      });
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size && channel) {
      supabase.removeChannel(channel); channel = null; clearInterval(expiryTimer);
    }
  };
}
export const subscribeToPublicDataChanges = listener => subscribe(listener, 'stale');
export const subscribeToPublicAdvisoryChanges = listener => subscribe(listener, 'advisory');
