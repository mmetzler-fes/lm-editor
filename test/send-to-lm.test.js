import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serverOrigin } from '../src/app/send-to-lm.js';

test('Adresse des Servers: nur der Origin, ohne Angabe https', () => {
  assert.equal(serverOrigin('lernen.schule.de'), 'https://lernen.schule.de');
  assert.equal(serverOrigin('  https://lernen.schule.de/irgendwo?x=1 '), 'https://lernen.schule.de');
  assert.equal(serverOrigin('http://localhost:3000/'), 'http://localhost:3000');
});

test('Adresse des Servers: anderes wird abgelehnt', () => {
  assert.equal(serverOrigin(''), null);
  assert.equal(serverOrigin('javascript://alert(1)'), null);
  assert.equal(serverOrigin('file:///etc/passwd'), null);
  assert.equal(serverOrigin('https://'), null);
  assert.equal(serverOrigin('nur text mit leerzeichen'), null);
});
