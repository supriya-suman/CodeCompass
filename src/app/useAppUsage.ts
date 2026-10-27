import { useEffect } from 'react';
import { newId } from '../lib/id';
import { todayIn } from '../lib/time';
import { useData } from './data';

/**
 * Counts active minutes inside CodeCompass for the activity map.
 * Active = the app is visible and the person interacted within the last two
 * minutes. Time is buffered in memory and saved every five minutes and
 * whenever the app is hidden, so it costs very few writes.
 * Each device writes its own record per day, so devices never overwrite each other.
 */
const TICK_MS = 15_000;
const IDLE_MS = 2 * 60_000;
const FLUSH_MS = 5 * 60_000;

function deviceId(): string {
  try {
    let id = localStorage.getItem('codecompass.deviceId');
    if (!id) {
      id = newId().replace(/-/g, '').slice(0, 12);
      localStorage.setItem('codecompass.deviceId', id);
    }
    return id;
  } catch {
    return 'device';
  }
}

export function useAppUsage() {
  const { db, mode, settings } = useData();
  const enabled = mode === 'real' && settings.trackAppUsage;
  const tz = settings.timezone;

  useEffect(() => {
    if (!enabled) return;
    const dev = deviceId();
    let lastInput = Date.now();
    let bufferMs = 0;
    let bufferDay = todayIn(tz);
    let lastFlush = Date.now();

    const flush = async () => {
      const ms = bufferMs;
      const day = bufferDay;
      bufferMs = 0;
      lastFlush = Date.now();
      if (ms < 1000) return;
      const id = `${day}__${dev}`;
      await db.transaction('rw', db.appUsage, async () => {
        const cur = await db.appUsage.get(id);
        const minutes = Math.round(((cur?.minutes ?? 0) + ms / 60000) * 100) / 100;
        const now = new Date().toISOString();
        await db.appUsage.put({ id, minutes, createdAt: cur?.createdAt ?? now, updatedAt: now });
      });
    };

    const onInput = () => (lastInput = Date.now());
    const tick = () => {
      const now = Date.now();
      const day = todayIn(tz);
      if (day !== bufferDay) {
        void flush();
        bufferDay = day;
      }
      if (document.visibilityState === 'visible' && now - lastInput < IDLE_MS) bufferMs += TICK_MS;
      if (now - lastFlush >= FLUSH_MS) void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void flush();
      else lastInput = Date.now();
    };

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const;
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true }));
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    const id = setInterval(tick, TICK_MS);
    return () => {
      clearInterval(id);
      events.forEach((e) => window.removeEventListener(e, onInput));
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      void flush();
    };
  }, [db, enabled, tz]);
}
