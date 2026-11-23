import fs from 'node:fs';
import path from 'node:path';

const REDIS_KEY = 'terminallike:todos:v1';
const LOCAL_FILE = path.join(process.cwd(), '.terminallike-todos.json');

let memoryStore = {
  items: [],
  source: null,
  syncedAt: null,
};

export function resetTodosMemory() {
  memoryStore = { items: [], source: null, syncedAt: null };
}

function getRedisConfig() {
  const url = (process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '').trim().replace(/\/+$/, '');
  const token = (process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '').trim();
  if (url && token) return { url, token };
  return null;
}

async function readStore() {
  const redis = getRedisConfig();
  if (redis) {
    try {
      const res = await fetch(`${redis.url}/get/${encodeURIComponent(REDIS_KEY)}`, {
        headers: { Authorization: `Bearer ${redis.token}` },
      });
      if (res.ok) {
        const json = await res.json();
        if (typeof json.result === 'string' && json.result) {
          const parsed = JSON.parse(json.result);
          if (parsed && Array.isArray(parsed.items)) {
            memoryStore = parsed;
            return parsed;
          }
        }
      }
    } catch {
      // Fall through to memory store
    }
    return memoryStore;
  }

  // Local Node server file persistence (skip on read-only Vercel filesystem)
  if (!process.env.VERCEL) {
    try {
      if (fs.existsSync(LOCAL_FILE)) {
        const parsed = JSON.parse(fs.readFileSync(LOCAL_FILE, 'utf8'));
        if (parsed && Array.isArray(parsed.items)) {
          memoryStore = parsed;
          return parsed;
        }
      }
    } catch {
      // Ignore corrupt local file
    }
  }

  return memoryStore;
}

async function writeStore(nextState) {
  memoryStore = nextState;

  const redis = getRedisConfig();
  if (redis) {
    try {
      await fetch(`${redis.url}/set/${encodeURIComponent(REDIS_KEY)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${redis.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(JSON.stringify(nextState)),
      });
      return { persisted: 'redis' };
    } catch {
      return { persisted: 'memory' };
    }
  }

  if (!process.env.VERCEL) {
    try {
      fs.writeFileSync(LOCAL_FILE, JSON.stringify(nextState, null, 2), 'utf8');
      return { persisted: 'file' };
    } catch {
      return { persisted: 'memory' };
    }
  }

  return { persisted: 'memory' };
}

/**
 * Normalizes incoming Apple Shortcuts / manual reminder payloads into clean todo items.
 * Accepts:
 *   - Array of objects: [{ title, dueDate, list, priority, completed }]
 *   - Array of strings: ["Læs kap. 4", "Køb mælk"]
 *   - Newline-separated string (direct output from iOS Shortcuts "Find Reminders"!)
 */
export function normalizeReminderInput(raw) {
  let list = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (typeof raw === 'string') {
    list = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  const out = [];
  list.forEach((entry, idx) => {
    if (typeof entry === 'string') {
      const title = entry.trim();
      if (!title) return;
      out.push({
        id: `rem_${idx}_${hashShort(title)}`,
        title,
        dueDate: null,
        list: 'Påmindelser',
        priority: 0,
        completed: false,
        source: 'apple-reminders',
      });
      return;
    }

    if (entry && typeof entry === 'object') {
      const title = String(entry.title || entry.name || entry.text || '').trim();
      if (!title) return;
      const completed = Boolean(entry.completed || entry.isCompleted);
      if (completed) return; // Only keep open reminders on the TV
      out.push({
        id: String(entry.id || `rem_${idx}_${hashShort(title)}`),
        title,
        dueDate: entry.dueDate ? String(entry.dueDate).trim() : null,
        list: String(entry.list || entry.calendar || 'Påmindelser').trim(),
        priority: Number(entry.priority) || 0,
        completed: false,
        source: String(entry.source || 'apple-reminders'),
      });
    }
  });

  return out;
}

function hashShort(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h).toString(36).slice(0, 6);
}

export function buildDemoTodos() {
  return [
    {
      id: 'demo_todo_1',
      title: 'Læs kap. 4 til metode-undervisning',
      dueDate: 'I dag',
      list: 'Studie',
      priority: 1,
      completed: false,
      source: 'demo',
    },
    {
      id: 'demo_todo_2',
      title: 'Skriv til studiegruppen om lokale',
      dueDate: 'I dag',
      list: 'Studie',
      priority: 0,
      completed: false,
      source: 'demo',
    },
    {
      id: 'demo_todo_3',
      title: 'Købe havremælk & kaffe',
      dueDate: null,
      list: 'Indkøb',
      priority: 0,
      completed: false,
      source: 'demo',
    },
    {
      id: 'demo_todo_4',
      title: 'Aflevere opgaveudkast på itslearning',
      dueDate: 'I morgen',
      list: 'Studie',
      priority: 1,
      completed: false,
      source: 'demo',
    },
  ];
}

function parseEnvTodos() {
  const raw = (process.env.TODOS || '').trim();
  if (!raw) return [];
  return raw
    .split(/[\n|]+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((title, idx) => ({
      id: `env_todo_${idx}_${hashShort(title)}`,
      title,
      dueDate: null,
      list: 'Påmindelser',
      priority: 0,
      completed: false,
      source: 'env',
    }));
}

/**
 * Returns the active to-do list for /api/briefing and /api/todos.
 */
export async function getTodos({ demoMode = false } = {}) {
  const store = await readStore();
  if (store.items && store.items.length > 0) {
    return {
      items: store.items,
      source: store.source || 'synced',
      syncedAt: store.syncedAt,
      persistent: Boolean(getRedisConfig() || !process.env.VERCEL),
    };
  }

  const envItems = parseEnvTodos();
  if (envItems.length > 0) {
    return {
      items: envItems,
      source: 'env',
      syncedAt: null,
      persistent: true,
    };
  }

  if (demoMode) {
    return {
      items: buildDemoTodos(),
      source: 'demo',
      syncedAt: null,
      persistent: false,
    };
  }

  return {
    items: [],
    source: 'empty',
    syncedAt: store.syncedAt,
    persistent: Boolean(getRedisConfig() || !process.env.VERCEL),
  };
}

/**
 * Replaces synced Apple Reminders (called from iOS Shortcuts) while keeping manual items.
 */
export async function syncAppleReminders(rawReminders) {
  const store = await readStore();
  const synced = normalizeReminderInput(rawReminders);
  const manualItems = (store.items || []).filter((item) => item.source === 'manual');
  const next = {
    items: [...synced, ...manualItems].slice(0, 30),
    source: 'apple-reminders',
    syncedAt: new Date().toISOString(),
  };
  const meta = await writeStore(next);
  return { ...next, ...meta };
}

/**
 * Adds, toggles, or deletes an individual to-do item.
 */
export async function mutateTodo({ action, id, title, dueDate, list }) {
  const store = await readStore();
  let items = [...(store.items || [])];

  if (action === 'add' && title && String(title).trim()) {
    const cleanTitle = String(title).trim();
    items.unshift({
      id: `man_${Date.now().toString(36)}_${hashShort(cleanTitle)}`,
      title: cleanTitle,
      dueDate: dueDate ? String(dueDate).trim() : null,
      list: String(list || 'Påmindelser').trim(),
      priority: 0,
      completed: false,
      source: 'manual',
    });
  } else if (action === 'toggle' && id) {
    items = items.map((item) =>
      item.id === id ? { ...item, completed: !item.completed } : item,
    );
  } else if (action === 'delete' && id) {
    items = items.filter((item) => item.id !== id);
  } else if (action === 'clear-completed') {
    items = items.filter((item) => !item.completed);
  }

  const next = {
    items: items.slice(0, 30),
    source: store.source || 'manual',
    syncedAt: new Date().toISOString(),
  };
  const meta = await writeStore(next);
  return { ...next, ...meta };
}
