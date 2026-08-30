import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [html, script, stylesheet] = await Promise.all([
  readFile(new URL('../public/remote.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/remote.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/remote.css', import.meta.url), 'utf8')
]);

test('Reply Studio stays out of the dashboard until its launcher opens the modal', () => {
  assert.match(html, /<button id="studio-open"[^>]*aria-haspopup="dialog"[^>]*>Open Reply Studio<\/button>/);
  assert.match(html, /<dialog id="reply-studio-modal"[^>]*>/);
  assert.match(html, /<button id="studio-close"[^>]*>Close<\/button>/);
  assert.ok(html.indexOf('<dialog id="reply-studio-modal"') > html.indexOf('</main>'));
});

test('Reply Studio can be opened, closed, and dismissed by clicking its backdrop', () => {
  assert.match(script, /studioModal\.showModal\(\)/);
  assert.match(script, /#studio-close'.*studioModal\.close\(\)/);
  assert.match(script, /event\.target === studioModal\) studioModal\.close\(\)/);
  assert.match(stylesheet, /\.studio-modal::backdrop/);
});
