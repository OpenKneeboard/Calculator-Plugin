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
  if (!page.nextBinaryOpFn) {
    return;
  }

  let rhs = buffer.textContent;

  buffer.textContent = page.nextBinaryOpFn(parseFloat(page.nextLHSOperand), parseFloat(rhs));
  pushHistory(history, page.nextLHSOperand, page.nextBinaryOpText, rhs, buffer.textContent, buffer);

  page.nextBinaryOpFn = null;
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

function onBinaryOp(page, history, staging, buffer, opText, opFn) {
  evalPending(page, history, staging, buffer);

  page.nextBinaryOpText = opText;
  page.nextBinaryOpFn = opFn;
  page.nextLHSOperand = buffer.textContent;

  staging.textContent = `${buffer.textContent} ${opText}`;

  buffer.textContent = "0";
}

function onUnaryOp(page, history, staging, buffer, opText, opFn) {
  const havePending = !!page.nextBinaryOpFn;
  evalPending(page, history, staging, buffer);

  const operand = parseFloat(buffer.textContent);
  buffer.textContent = opFn(operand);
  if (opText !== '=' || !havePending) {
    pushHistory(history, operand, opText, '', buffer.textContent, buffer);
  }

  staging.textContent = ""; 
}

function appendPage() {
  const template = document.getElementById('pageTemplate');
  const page = template.cloneNode(true);
  page.id = crypto.randomUUID();
  page.classList.remove('hidden');
  document.getElementById('pagesRoot').appendChild(page);

  const history = page.querySelector('.history');
  const buffer = page.querySelector('.buffer');
  const staging = page.querySelector('.staging');

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

  page.querySelector('.opPlus').addEventListener(
    'click',
    () => onBinaryOp(page, history, staging, buffer, "+", (a, b) => a + b)
  );
  page.querySelector('.opMinus').addEventListener(
    'click',
    () => onBinaryOp(page, history, staging, buffer, "-", (a, b) => a - b)
  );
  page.querySelector('.opMultiply').addEventListener(
    'click',
    () => onBinaryOp(page, history, staging, buffer, "×", (a, b) => a * b)
  );
  page.querySelector('.opDivide').addEventListener(
    'click',
    () => onBinaryOp(page, history, staging, buffer, "÷", (a, b) => a / b)
  );

  page.querySelector('.opEquals').addEventListener(
    'click',
    () => onUnaryOp(page, history, staging, buffer, '=', (x) => x)
  );
  page.querySelector('.opSqrt').addEventListener(
    'click',
    () => onUnaryOp(page, history, staging, buffer, '√', (x) => Math.sqrt(x))
  );
}

if (!window.OpenKneeboard) {
  document.body.classList.add('dev');
  appendPage();
}
