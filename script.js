// Copyright (c) 2024 Fred Emmott
// SPDX-License-Identifier: MIT
function onNumber(buffer, value) {
  if (buffer.textContent === '0') {
    if (value === '0') {
      return;
    }
    buffer.textContent = value;
    return;
  }

  buffer.textContent += value;
}

function evalPending(page, history, staging, buffer) {
  const op = page.nextBinaryOp;
  if (!op) {
    return;
  }
  page.nextBinaryOp = null;

  let rhs = buffer.textContent;

  buffer.textContent = op.invoke(parseFloat(page.nextLHSOperand), parseFloat(rhs));
  pushHistory(history, page.nextLHSOperand, op.label, rhs, buffer.textContent, buffer);
}

function pushHistory(history, lhs, op, rhs, result, buffer) {
  let lhsNode = document.createElement('div');
  lhsNode.textContent = lhs;
  lhsNode.className = "mono historyOperand historyValue lhs";
  lhsNode.setAttribute('data-value', lhs);

  let opNode = document.createElement('div');
  opNode.textContent = op;
  opNode.className = "mono historyOp";

  let rhsNode = document.createElement('div');
  rhsNode.textContent = rhs;
  rhsNode.className = "mono historyOperand historyValue rhs";
  rhsNode.setAttribute('data-value', rhs);

  let resultNode = document.createElement('div')
  resultNode.textContent = result;
  resultNode.className = "mono historyResult historyValue";
  resultNode.setAttribute('data-value', result);

  for (const node of [lhsNode, rhsNode, resultNode]) {
    node.addEventListener(
      'click',
      () => buffer.textContent = node.getAttribute('data-value')
    );
  }

  history.prepend(lhsNode, opNode, rhsNode, resultNode);
}

class Op {
  #label;

  constructor(label) {
    this.#label = label;
  }

  get label() {
    return this.#label;
  }
}

class BinaryOp extends Op {
  #fn;
  constructor(label, fn) {
    super(label);
    this.#fn = fn;
  }

  invoke(a, b) {
    return this.#fn(a, b);
  }
}

const BinaryOps = {
  Plus: new BinaryOp('+', (a, b) => a + b),
  Minus: new BinaryOp('-', (a, b) => a - b),
  Multiply: new BinaryOp('×', (a, b) => a * b),
  Divide: new BinaryOp("÷", (a, b) => a / b),
};

function onBinaryOp(page, history, staging, buffer, op) {
  evalPending(page, history, staging, buffer);

  page.nextBinaryOp = op;
  page.nextLHSOperand = buffer.textContent;

  staging.textContent = `${buffer.textContent} ${op.label}`;

  buffer.textContent = "0";
}

class UnaryOp extends Op {
  #fn;
  constructor(label, fn) {
    super(label);
    this.#fn = fn;
  }

  invoke(x) {
    return this.#fn(x);
  }
}

const UnaryOps = {
  Equals: new UnaryOp('=', (x) => x),
  Sqrt: new UnaryOp('√', Math.sqrt),
};

function onUnaryOp(page, history, staging, buffer, op) {
  const havePending = !!page.nextBinaryOp;
  evalPending(page, history, staging, buffer);

  const operand = parseFloat(buffer.textContent);
  buffer.textContent = op.invoke(operand);
  if (op.label !== '=' || !havePending) {
    pushHistory(history, operand, op.label, '', buffer.textContent, buffer);
  }

  staging.textContent = ""; 
}

function appendPage() {
  const id = crypto.randomUUID();
  appendPageWithID(id);
}

function appendPageWithID(id) {
  const template = document.getElementById('pageTemplate');
  const page = template.cloneNode(true);
  page.id = id;
  page.classList.remove('hidden');
  document.getElementById('pagesRoot').appendChild(page);
  attachJSToPage(page);
}

function onOp(page, op, sendToPeers= true) {
  const history = page.querySelector('.history');
  const buffer = page.querySelector('.buffer');
  const staging = page.querySelector('.staging');

  if (op in BinaryOps) {
    onBinaryOp(page, history, staging, buffer, BinaryOps[op]);
    return;
  }

  if (op in UnaryOps) {
    onUnaryOp(page, history, staging, buffer, UnaryOps[op]);
    return;
  }

  // Should be unreachable - all ops should either be a binary op or an unary op
  debugger;
}

function attachJSToPage(page) {
  const buffer = page.querySelector('.buffer');

  for(const button of page.querySelectorAll("button.num")) {
    button.addEventListener('click', () => {
      onNumber(buffer, button.getAttribute('data-value'));
    });
  }

  page.querySelector('.backspace').addEventListener(
    'click',
    () => {
      buffer.textContent = buffer.textContent.substring(0, buffer.textContent.length - 1);
      if (buffer.textContent === '') {
        buffer.textContent = '0';
      }
    }
  );

  for(const op of ['Plus', 'Minus', 'Multiply', 'Divide', 'Equals', 'Sqrt']) {
    page.querySelector(`.op${op}`).addEventListener(
      'click',
      () => onOp(page, op)
    );
  }
}

if (!window.OpenKneeboard) {
  document.body.classList.add('dev');
  appendPage();
}
