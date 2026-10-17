import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEFAULT_SETTINGS } from '../../src/domain/settings';
import type { ParentData } from '../../src/ui/parent/ParentApp';
import { ConversationsPage } from '../../src/ui/parent/pages/ConversationsPage';

function sampleData(enabled: boolean, consentToSend: boolean, endpoint = '/api'): ParentData {
  const child = {
    id: 'sample',
    householdId: 'sample-school',
    name: 'Sample',
    avatarId: 'sample-avatar',
    status: 'active' as const,
    createdAt: '2026-01-01T12:00:00Z',
  };
  return {
    child,
    children: [child],
    avatar: undefined,
    household: {
      id: child.householdId,
      name: 'Synthetic school',
      createdAt: child.createdAt,
      schemaVersion: 2,
      settings: {
        ...DEFAULT_SETTINGS,
        // These separate features do not depend on the AI chat enabled/consent pair.
        talkMode: 'helper',
        teacherAi: { enabled, consentToSend, endpoint, naturalVoices: true },
      },
    },
    records: { books: [], sessions: [], activities: [], evidence: [], mastery: [], lessons: [], unlocks: [], portfolio: [], interactions: [] },
  };
}

for (const enabled of [false, true]) {
  for (const consent of [false, true]) {
    test(`Teacher talk scopes its sharing notice with AI enabled=${enabled}, consent=${consent}`, () => {
      const data = sampleData(enabled, consent);
      const before = structuredClone(data);
      const html = renderToStaticMarkup(createElement(ConversationsPage, { data }));
      const on = enabled && consent;
      assert.match(html, new RegExp(`Optional AI chat: ${on ? 'on' : 'off'}`));
      assert.match(html, /Saved conversations and activity summaries for Sample/);
      assert.match(html, /Some activities save summaries rather than every line/);
      assert.match(html, /stored in this browser/);
      assert.match(html, /family sync when enabled, or in exports you make/);
      assert.match(html, /Voice and microphone sharing are controlled separately/);
      assert.match(html, /may send text or audio to other services/);
      assert.match(html, /href="#\/parent\/settings"/);
      if (on) {
        assert.match(html, /helper and its AI service receive text/);
        for (const field of ['first name', 'current message', 'recent conversation turns', 'book titles']) assert.ok(html.includes(field));
        assert.match(html, /AI replies are marked/);
        assert.doesNotMatch(html, /Built-in chat replies run on this device/);
      } else {
        assert.match(html, /Built-in chat replies run on this device/);
        assert.doesNotMatch(html, /AI service receive text/);
      }
      assert.doesNotMatch(html, /Stored only on this device|nothing is sent anywhere|word for word|every conversation|never sent|zero retention/i);
      assert.deepEqual(data, before, 'rendering must not change settings or stored records');
    });
  }
}

test('an invalid helper address does not claim optional AI chat is on', () => {
  const html = renderToStaticMarkup(createElement(ConversationsPage, { data: sampleData(true, true, 'http://untrusted.invalid') }));
  assert.match(html, /Optional AI chat: off/);
  assert.match(html, /Voice and microphone sharing are controlled separately/);
});
