// Copyright (c) 2024 Fred Emmott
// SPDX-License-Identifier: MIT

const InstanceKind = Object.freeze({
  None: Symbol('None'),
  Standalone: Symbol('Standalone'),
  First: Symbol('First'),
  Additional: Symbol('Additional'),
})

let instanceKind = InstanceKind.None;
const instanceId = crypto.randomUUID();

class HistoryEntry {
  constructor(lhs, op, rhs, result) {
    this.lhs = lhs;
    this.op = op;
    this.rhs = rhs;
    this.result = result;
  }
}

class PageUI {
  #id;
  #bufferNode;
  #stagingNode;
  #historyNode;
  #historyEntries = [];

  constructor(node) {
    this.#id = node.id;
    this.#bufferNode = node.querySelector('.buffer');
    this.#stagingNode = node.querySelector('.staging');
    this.#historyNode = node.querySelector('.history');
  }

  mutated = false;

  pendingBinaryOp = null;
  pendingBinaryLHS = null;

  get id() {
    return this.#id;
  }

  get buffer() {
   return this.#bufferNode.textContent;
  }

  set buffer(value) {
    this.#bufferNode.textContent = value;
  }

  get staging() {
    return this.#stagingNode.textContent;
  }

  set staging(value) {
    this.#stagingNode.textContent = value;
  }

  get history() {
    return this.#historyEntries;
  }

  pushHistoryEntry(entry) {
    let lhsNode = document.createElement('div');
    lhsNode.textContent = entry.lhs;
    lhsNode.className = "mono historyOperand historyValue lhs";
    lhsNode.setAttribute('data-value', entry.lhs);

    let opNode = document.createElement('div');
    opNode.textContent = entry.op;
    opNode.className = "mono historyOp";

    let rhsNode = document.createElement('div');
    rhsNode.textContent = entry.rhs;
    rhsNode.className = "mono historyOperand historyValue rhs";
    rhsNode.setAttribute('data-value', entry.rhs);

    let resultNode = document.createElement('div')
    resultNode.textContent = entry.result;
    resultNode.className = "mono historyResult historyValue";
    resultNode.setAttribute('data-value', entry.result);

    for (const node of [lhsNode, rhsNode, resultNode]) {
      node.addEventListener(
        'click',
        () => setBuffer(this, node.getAttribute('data-value'))
      );
    }

    this.#historyEntries.push(entry);
    this.#historyNode.prepend(lhsNode, opNode, rhsNode, resultNode);
  }
}

function onNumber(page, value, isOriginInstance = true) {
  onMutate(page, isOriginInstance);

  if (isOriginInstance && window.OpenKneeboard?.SendMessageToPeers) {
    OpenKneeboard.SendMessageToPeers({
      kind: 'number',
      sender: instanceId,
      page: page.id,
      value: value,
    })
  }

  if (page.buffer === '0') {
    if (value === '0') {
      return;
    }
    page.buffer = value;
    return;
  }

  page.buffer += value;
}

function evalPending(page) {
  const op = page.pendingBinaryOp;
  if (!op) {
    return;
  }
  page.pendingBinaryOp = null;

  const rhs = page.buffer;

  page.buffer = op.invoke(parseFloat(page.pendingBinaryLHS), parseFloat(rhs));
  page.pushHistoryEntry(new HistoryEntry(page.pendingBinaryLHS, op.label, rhs, page.buffer));
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

const BinaryOps = Object.freeze({
  Plus: new BinaryOp('+', (a, b) => a + b),
  Minus: new BinaryOp('-', (a, b) => a - b),
  Multiply: new BinaryOp('×', (a, b) => a * b),
  Divide: new BinaryOp("÷", (a, b) => a / b),
});

function onBinaryOp(page, op) {
  evalPending(page);

  page.pendingBinaryOp = op;
  page.pendingBinaryLHS = page.buffer;

  page.staging = `${page.buffer} ${op.label}`;

  page.buffer = "0";
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

const UnaryOps = Object.freeze({
  Equals: new UnaryOp('=', (x) => x),
  Sqrt: new UnaryOp('√', Math.sqrt),
});

function onUnaryOp(page, op) {
  const havePending = !!page.pendingBinaryOp;
  evalPending(page);

  const operand = parseFloat(page.buffer);
  page.buffer = op.invoke(operand);
  if (op.label !== '=' || !havePending) {
    page.pushHistoryEntry(new HistoryEntry(operand, op.label, '', page.buffer));
  }

  page.staging = "";
}

function appendPage(id = crypto.randomUUID()) {
  const template = document.getElementById('pageTemplate');
  const page = template.cloneNode(true);
  page.id = id;
  page.classList.add('page');
  document.getElementById('pagesRoot').appendChild(page);
  attachJSToPage(page);
  return page;
}

function onOp(page, op, isOriginInstance= true) {
  onMutate(page, isOriginInstance);
  if (isOriginInstance && window.OpenKneeboard?.SendMessageToPeers) {
    OpenKneeboard.SendMessageToPeers({
      kind: 'op',
      sender: instanceId,
      page: page.id,
      op: op,
    });
  }

  if (op in BinaryOps) {
    onBinaryOp(page, BinaryOps[op]);
    return;
  }

  if (op in UnaryOps) {
    onUnaryOp(page, UnaryOps[op]);
    return;
  }

  // Should be unreachable - all ops should either be a binary op or an unary op
  debugger;
}

function attachJSToPage(pageNode) {
  const page = new PageUI(pageNode);
  pageNode.okbCalculator = page;

  for(const button of pageNode.querySelectorAll("button.num")) {
    button.addEventListener('click', () => {
      onNumber(page, button.getAttribute('data-value'));
    });
  }

  pageNode.querySelector('.backspace').addEventListener(
    'click',
    () => onBackspace(page)
  );

  for(const op of ['Plus', 'Minus', 'Multiply', 'Divide', 'Equals', 'Sqrt']) {
    pageNode.querySelector(`.op${op}`).addEventListener(
      'click',
      () => onOp(page, op)
    );
  }
}

async function initializeNewOpenKneeboardTab() {
  const page = appendPage();
  await OpenKneeboard.SetPages([ { guid: page.id, pixelSize: { width: 768, height: 1024 }}]);
  instanceKind = InstanceKind.First;
}

async function initializeExistingOpenKneeboardTab(pages) {
  for (const page of pages) {
    appendPage(page.guid);
  }
  instanceKind = InstanceKind.Additional;

  await OpenKneeboard.SendMessageToPeers({
    kind: "bootstrapRequest",
    sender: instanceId,
  });
}

async function sendBootstrapData(sender) {
  let response = {};
  for (const node of document.querySelectorAll('.page')) {
    const page = node.okbCalculator;
    let pageData = {
      id: page.id,
      buffer: page.buffer,
      staging: page.staging,
      history: page.history,
    };

    if (page.pendingBinaryOp) {
      for (const [name, value] of BinaryOps) {
        if (value === page.pendingBinaryOp) {
          pageData.pendingBinaryOp = name;
          pageData.pendingBinaryLHS = page.pendingBinaryLHS;
          break;
        }
      }
    }

    response[page.id] = pageData;
  }
  await OpenKneeboard.SendMessageToPeers({
    kind: 'bootstrapResponse',
    recipient: sender,
    response: response,
  });
}

function onMutate(page, isOriginInstance) {
  if (page.mutated) {
    return;
  }
  page.mutated = true;

  if (!isOriginInstance) {
    return;
  }

  const newPage = appendPage();
  if (!window.OpenKneeboard?.SendMessageToPeers) {
    return;
  }

  OpenKneeboard.SendMessageToPeers({
    kind: 'appendPage',
    sender: instanceId,
    page: newPage.id,
  });

  OpenKneeboard.SetPages(
    Array.from(document.getElementsByClassName('page')).map((node) => {
      return {guid: node.id, pixelSize: {width: 768, height: 1024}};
    }));
}

function onBackspace(page, isOriginInstance = true) {
  if (isOriginInstance && window.OpenKneeboard?.SendMessageToPeers) {
    OpenKneeboard.SendMessageToPeers({
      kind: 'backspace',
      sender: instanceId,
      page: page.id,
    })
  }

  page.buffer =  page.buffer.substring(0, page.buffer.length - 1);
}

function setBuffer(page, value, isOriginInstance = true) {
  if (isOriginInstance && window.OpenKneeboard?.SendMessageToPeers) {
    OpenKneeboard.SendMessageToPeers({
      kind: 'setBuffer',
      sender: instanceId,
      page: page.id,
      value: value,
    })
  }

  page.buffer = value;
}

async function loadBootstrapData(data) {
  const pages = Array.from(document.querySelectorAll('.page')).map(
    (node) => node.okbCalculator
  );

  for (const page of pages) {
    const pageData = data[page.id];
    if (!pageData) {
      continue;
    }

    page.buffer = pageData.buffer;
    page.staging = pageData.staging;
    for (const entry of pageData.history) {
      page.pushHistoryEntry(entry);
    }

    if (!pageData.pendingBinaryOp) {
      continue;
    }

    page.pendingBinaryOp = BinaryOps[pageData.pendingBinaryOp];
    page.pendingBinaryLHS = pageData.pendingBinaryLHS;
  }
}

async function onPeerMessage(ev) {
  const message = ev.detail.message;

  switch (message.kind) {
    case 'bootstrapResponse':
      if (message.recipient === instanceId) {
        await loadBootstrapData(message.response);
      }
      return;
    case 'op':
      onOp(document.getElementById(message.page).okbCalculator, message.op, false);
      return;
    case 'number':
      onNumber(document.getElementById(message.page).okbCalculator, message.value, false);
      return;
    case 'backspace':
      onBackspace(document.getElementById(message.page).okbCalculator, false);
      return;
    case 'setBuffer':
      setBuffer(document.getElementById(message.page).okbCalculator, message.value, false);
      return;
    case 'appendPage':
      appendPage(message.page);
      return;
  }

  if (instanceKind !== InstanceKind.First) {
    return;
  }

  switch (message.kind) {
    case 'bootstrapRequest':
      await sendBootstrapData(message.sender);
      return;
  }
}

function onPageChanged(ev) {
  const id= ev.detail.page.guid;
  for (const node of document.getElementsByClassName('page')){
    console.log('onPageChanged', node, node.id, id);
    node.classList.toggle('hidden', node.id !== id);
  }
}

async function initOpenKneeboard() {
  OpenKneeboard.addEventListener('peerMessage', onPeerMessage);
  OpenKneeboard.addEventListener('pageChanged', onPageChanged);
  await OpenKneeboard.EnableExperimentalFeature("PageBasedContent", 2024073001);

  const pages = await OpenKneeboard.GetPages();
  if (pages.havePages) {
    await initializeExistingOpenKneeboardTab(pages.pages);
  } else {
    await initializeNewOpenKneeboardTab();
  }

  document.body.classList.add('OpenKneeboard');
  console.log(document.querySelector('.page'));
  document.querySelector('.page').classList.remove('hidden');
}

initOpenKneeboard().catch(() => {
  instanceKind = InstanceKind.Standalone;
  document.body.classList.add('fallbackUI');
  appendPage().classList.remove('hidden');
});