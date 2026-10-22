// Run: node --test tests/test_standard_iteration_ui.cjs
// Isolated DOM/API doubles: never create business records in the live database.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/standards.js'), 'utf8');

function setup() {
  let dialog;
  const calls = [], opened = [], notices = [];
  const document = {
    activeElement: {focus() {}},
    querySelector: () => dialog || null,
    querySelectorAll: () => [],
    body: {append(element) {dialog = element;}},
    createElement() {
      const fields = {};
      for (const key of ['#standard-iteration-form', '#iteration-note', '#iteration-error', '#iteration-submit', '#iteration-cancel', '.close']) {
        fields[key] = {value: '', disabled: false, textContent: '', focus() {document.activeElement = this;}, setAttribute() {}, removeAttribute() {}};
      }
      return {
        fields, remove() {dialog = null;},
        querySelector: key => fields[key],
        querySelectorAll: () => [fields['.close'], fields['#iteration-cancel'], fields['#iteration-submit']],
      };
    },
  };
  const context = vm.createContext({document, prompt() {throw Error('prompt() is not supported.');},
    api: async (...args) => {calls.push(args); return {standard: {id: 'v2', version_number: 2}};},
    toast: msg => notices.push(msg),
  });
  vm.runInContext(source, context);
  context.openStandardEditor = async id => opened.push(id);
  context.startStandardIteration('v1');
  return {context, calls, opened, notices, get dialog() {return dialog;},
    submit: () => dialog.fields['#standard-iteration-form'].onsubmit({preventDefault() {}})};
}

test('opens an in-page dialog without native prompt; cancel creates nothing', () => {
  const s = setup();
  assert.match(s.dialog.innerHTML, /role="dialog"/);
  const original = s.dialog;
  s.context.startStandardIteration('v1');
  assert.equal(s.dialog, original);
  s.dialog.fields['#iteration-cancel'].onclick();
  assert.equal(s.dialog, null);
  assert.equal(s.calls.length, 0);
});

test('rejects whitespace-only note in place', async () => {
  const s = setup();
  s.dialog.fields['#iteration-note'].value = '  ';
  await s.submit();
  assert.equal(s.dialog.fields['#iteration-error'].textContent, '请填写迭代说明');
  assert.equal(s.calls.length, 0);
});

test('successful submit creates one version and opens its editor', async () => {
  const s = setup();
  s.dialog.fields['#iteration-note'].value = '  补充知识要求  ';
  await s.submit();
  assert.equal(s.calls[0][0], '/api/admin/standards/v1/iterate');
  assert.equal(JSON.parse(s.calls[0][1].body).changeNote, '补充知识要求');
  assert.deepEqual(s.opened, ['v2']);
  assert.equal(s.dialog, null);
  assert.equal(s.notices[0], '已创建 V2 迭代版本');
});

test('prevents duplicate submit and displays API errors without losing the note', async () => {
  const s = setup();
  let rejectRequest, requests = 0;
  s.context.api = () => {requests++; return new Promise((resolve, reject) => {rejectRequest = reject;});};
  s.dialog.fields['#iteration-note'].value = '更新要求';
  const first = s.submit();
  assert.equal(s.dialog.fields['#iteration-submit'].disabled, true);
  s.dialog.fields['#iteration-cancel'].onclick();
  assert.ok(s.dialog);
  await s.submit();
  assert.equal(requests, 1);
  rejectRequest(Error('该标准已有开发中的版本'));
  await first;
  assert.equal(s.dialog.fields['#iteration-error'].textContent, '该标准已有开发中的版本');
  assert.equal(s.dialog.fields['#iteration-note'].value, '更新要求');
  assert.equal(s.dialog.fields['#iteration-submit'].disabled, false);
});
