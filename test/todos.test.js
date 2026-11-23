import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { createAppServer } from '../server.js';
import { normalizeReminderInput, resetTodosMemory } from '../lib/todos.js';

const LOCAL_FILE = path.join(process.cwd(), '.terminallike-todos.json');

describe('Todos & Apple Påmindelser sync', () => {
  let server;
  let baseUrl;

  before(async () => {
    server = createAppServer();
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  beforeEach(() => {
    resetTodosMemory();
    if (fs.existsSync(LOCAL_FILE)) fs.unlinkSync(LOCAL_FILE);
  });

  after(async () => {
    if (fs.existsSync(LOCAL_FILE)) fs.unlinkSync(LOCAL_FILE);
    await new Promise((resolve) => server.close(resolve));
  });

  it('normalizes newline-separated iOS Shortcuts Find Reminders output', () => {
    const items = normalizeReminderInput('Læs kap. 4\nKøb kaffe\nRing til tandlæge');
    assert.equal(items.length, 3);
    assert.equal(items[0].title, 'Læs kap. 4');
    assert.equal(items[0].source, 'apple-reminders');
  });

  it('syncs Apple Reminders via POST /api/todos and toggles manual items', async () => {
    const syncRes = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'apple-reminders',
        reminders: [
          { title: 'Aflever opgave', dueDate: 'I dag', list: 'Studie' },
          { title: 'Allerede færdig', completed: true },
        ],
      }),
    });
    assert.equal(syncRes.status, 200);
    const synced = await syncRes.json();
    assert.equal(synced.ok, true);
    assert.equal(synced.items.length, 1);
    assert.equal(synced.items[0].title, 'Aflever opgave');

    const addRes = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', title: 'Køb havremælk' }),
    });
    const added = await addRes.json();
    assert.equal(added.items.length, 2);

    const manualId = added.items[0].id;
    const toggleRes = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'toggle', id: manualId }),
    });
    const toggled = await toggleRes.json();
    assert.equal(toggled.items.find((i) => i.id === manualId).completed, true);
  });
});
