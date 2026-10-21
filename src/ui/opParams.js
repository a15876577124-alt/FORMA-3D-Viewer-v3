// 算子参数控件：完全由后端 /api/ops 返回的 schema 生成。
// 原则：schema 里没有的参数，界面上绝不出现（杜绝「看起来能调、实际无效」的假控件）。
import { el } from '../utils/dom.js';

function defaultValue(spec) {
  if (spec.default !== undefined) return spec.default;
  switch (spec.type) {
    case 'number':
    case 'integer': return spec.min ?? 0;
    case 'bool': return false;
    case 'enum': return spec.options?.[0]?.value ?? '';
    default: return '';
  }
}

// 渲染单个参数控件。onChange 在值变化时触发。
function renderControl(key, spec, value, onChange) {
  const id = `op-${key}`;
  let input;

  if (spec.type === 'enum') {
    input = el('select', { id, class: 'p-select' });
    for (const o of spec.options || []) {
      input.append(el('option', { value: String(o.value) }, o.label || String(o.value)));
    }
    input.value = String(value);
    input.addEventListener('change', () => onChange(key, input.value));
  } else if (spec.type === 'bool') {
    input = el('input', { type: 'checkbox', id });
    input.checked = !!value;
    input.addEventListener('change', () => onChange(key, input.checked));
  } else {
    const isInt = spec.type === 'integer';
    const step = spec.step ?? (isInt ? 1 : 0.01);
    input = el('input', {
      type: isInt && step >= 1 ? 'number' : 'number',
      id, class: 'p-num',
      step: String(step),
      min: spec.min !== undefined ? String(spec.min) : '',
      max: spec.max !== undefined ? String(spec.max) : '',
      value: String(value),
    });
    input.addEventListener('input', () => {
      const raw = input.value === '' ? spec.default : Number(input.value);
      if (Number.isNaN(raw)) return;
      let v = raw;
      if (spec.min !== undefined) v = Math.max(spec.min, v);
      if (spec.max !== undefined) v = Math.min(spec.max, v);
      onChange(key, isInt ? Math.round(v) : v);
    });
  }

  const wrap = el('label', { class: 'field p-param' },
    el('span', {}, spec.label + (spec.unit ? ` (${spec.unit})` : '')),
    input,
  );
  if (spec.hint) wrap.append(el('em', { class: 'p-hint' }, spec.hint));
  return wrap;
}

// 为一组算子生成参数编辑器。
// ops: [{ name, appearance, params(spec), label, group, desc }]
// values: { [opName]: { [paramKey]: value } }
// 返回 { node, getValues() }
export function buildOpParamEditor({ ops, values = {}, onChange } = {}) {
  const node = el('div', { class: 'p-params' });
  const store = { ...values };
  // 分组节点会被调用方移动到各自的算子行内，因此这里保留直接引用，
  // 不能依赖 node.querySelector（移动后就查不到了）。
  const groups = new Map();

  function emit() {
    if (onChange) onChange(store);
  }

  for (const op of ops) {
    const specs = op.params || {};
    const keys = Object.keys(specs);
    if (!keys.length) continue;

    const box = el('div', { class: 'p-param-group', 'data-op': op.name, hidden: true },
      el('h5', {}, op.label || op.name),
    );
    if (!store[op.name]) store[op.name] = {};
    for (const key of keys) {
      const spec = specs[key];
      if (store[op.name][key] === undefined) store[op.name][key] = defaultValue(spec);
      const ctrl = renderControl(key, spec, store[op.name][key], (k, v) => {
        store[op.name][k] = v;
        emit();
      });
      box.append(ctrl);
    }
    groups.set(op.name, box);
    node.append(box);
  }

  return {
    node,
    getValues: () => JSON.parse(JSON.stringify(store)),
    // 展开/收起某算子的参数区（按引用取，节点被移动后依然有效）
    setVisible(opName, visible) {
      const box = groups.get(opName);
      if (box) box.hidden = !visible;
    },
    setValues(next) {
      for (const [opName, pv] of Object.entries(next || {})) {
        store[opName] = { ...(store[opName] || {}), ...pv };
        const box = groups.get(opName);
        if (!box) continue;
        // 同步到控件显示
        for (const [key, val] of Object.entries(store[opName])) {
          const ctrl = box.querySelector(`#op-${key}`);
          if (ctrl) {
            if (ctrl.type === 'checkbox') ctrl.checked = !!val;
            else ctrl.value = String(val);
          }
        }
      }
      emit();
    },
  };
}

// 从 schema 取出默认值集合（用于「重置」）
export function defaultParams(specs = {}) {
  const out = {};
  for (const [key, spec] of Object.entries(specs)) out[key] = defaultValue(spec);
  return out;
}
