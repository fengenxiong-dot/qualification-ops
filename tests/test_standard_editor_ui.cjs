// Run: node --test tests/test_standard_editor_ui.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../static/standards.js'), 'utf8');

function setup(standard) {
  const app = {innerHTML: ''};
  const inputs = {
    '#standard-name': {value: '平台软件资格标准'},
    '#standard-subcategory': {value: 'sub'},
    '#standard-change-note': {value: '补充标准'},
  };
  for (const key of ['basic', 'knowledge', 'skills', 'competencies']) {
    inputs[`#framework-content-${key}`] = {value: key + '要求'};
    inputs[`#framework-method-${key}`] = {value: '材料核验'};
  }
  const context = vm.createContext({
    app, title: {}, window: {}, esc: value => String(value ?? ''),
    toast: message => {throw Error(message);},
    api: async url => url.includes('job-taxonomy') ? {items: []} : {standard, modules: []},
    document: {querySelector: key => inputs[key] || null, querySelectorAll: () => []},
  });
  vm.runInContext(source, context);
  return {context, app};
}

test('new standard form omits level, status and description fields; saving needs none', async () => {
  const {context, app} = setup();
  await context.openStandardEditor();
  for (const id of ['standard-level', 'standard-status', 'standard-description']) {
    assert.equal(app.innerHTML.includes(`id="${id}"`), false);
  }
  assert.ok(app.innerHTML.includes('id="standard-name"'));
  assert.ok(app.innerHTML.includes('id="standard-subcategory"'));
  const draft = context.standardPayload('草稿');
  assert.equal(draft.level, '');
  assert.equal(draft.description, '');
  assert.equal(draft.status, '草稿');
  assert.equal(context.standardPayload('已存档').status, '已存档');
});

test('editing an existing version preserves historical level and description', async () => {
  const {context} = setup({id: 'existing', name: '旧标准', level: 'T4', description: '原适用说明', status: '草稿', framework: {}, revision: 2});
  await context.openStandardEditor('existing');
  const payload = context.standardPayload('草稿');
  assert.equal(payload.level, 'T4');
  assert.equal(payload.description, '原适用说明');
  assert.equal(payload.revision, 2);
});
