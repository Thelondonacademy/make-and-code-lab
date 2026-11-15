// Traduce il codice JavaScript/TypeScript di MakeCode in JavaScript asincrono
// che il simulatore può fermare e mettere in pausa (basic.pause, forever, eventi).
//
// Strategia: ogni funzione diventa async e ogni chiamata viene attesa con await.
// Attendere un valore normale non cambia nulla, quindi è sicuro anche per Math.abs ecc.
// Nei cicli aggiungiamo `await __tick()` per non bloccare la pagina con i cicli infiniti.
import { transform } from 'sucrase';
import * as acorn from 'acorn';
import * as walk from 'acorn-walk';
import { generate } from 'astring';

/** Metodi degli array che chiamano una funzione in modo sincrono: lì non si può usare await. */
const SYNC_CALLBACK_METHODS = new Set(['sort', 'map', 'filter', 'find', 'findIndex', 'some', 'every', 'reduce', 'forEach', 'indexOf', 'join']);

export class TranspileError extends Error {
  constructor(message: string, public line?: number) { super(message); }
}

type AnyNode = acorn.Node & Record<string, any>;

export function transpile(source: string): string {
  let js: string;
  try {
    js = transform(source, { transforms: ['typescript'], disableESTransforms: true }).code;
  } catch (e: any) {
    throw new TranspileError('Il codice ha un errore di scrittura: ' + String(e.message || e).split('\n')[0]);
  }
  let ast: AnyNode;
  try {
    ast = acorn.parse(js, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true, locations: true }) as AnyNode;
  } catch (e: any) {
    throw new TranspileError('Il codice ha un errore di scrittura vicino alla riga ' + (e.loc?.line ?? '?'), e.loc?.line);
  }

  // 1) segna le funzioni passate ai metodi sincroni degli array: restano sincrone
  const syncFns = new Set<AnyNode>();
  walk.full(ast, (node: AnyNode) => {
    if (node.type === 'CallExpression' && node.callee.type === 'MemberExpression' && !node.callee.computed
      && SYNC_CALLBACK_METHODS.has(node.callee.property.name)) {
      for (const a of node.arguments) {
        if (a.type === 'FunctionExpression' || a.type === 'ArrowFunctionExpression') syncFns.add(a);
      }
    }
  });

  // 2) trasforma: funzioni async, chiamate con await, __tick() nei cicli
  transformNode(ast, false, syncFns);
  return generate(ast as any);
}

const isFn = (n: AnyNode) => n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression';
const isLoop = (n: AnyNode) => ['WhileStatement', 'DoWhileStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement'].includes(n.type);

function tickStmt(): AnyNode {
  return {
    type: 'ExpressionStatement',
    expression: { type: 'AwaitExpression', argument: { type: 'CallExpression', callee: { type: 'Identifier', name: '__tick' }, arguments: [], optional: false } },
  } as any;
}

/** Visita l'albero. `syncCtx` = siamo dentro una funzione che deve restare sincrona. */
function transformNode(node: AnyNode, syncCtx: boolean, syncFns: Set<AnyNode>): AnyNode {
  if (!node || typeof node.type !== 'string') return node;

  let ctx = syncCtx;
  if (isFn(node)) {
    ctx = syncFns.has(node);
    node.async = !ctx;
    if (node.generator) node.generator = false;
  }

  if (isLoop(node) && !ctx) {
    const body = node.body.type === 'BlockStatement' ? node.body : { type: 'BlockStatement', body: [node.body] };
    body.body.unshift(tickStmt());
    node.body = body;
  }

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'type') continue;
    const v = node[key];
    if (Array.isArray(v)) {
      node[key] = v.map((c: any) => (c && typeof c.type === 'string' ? transformNode(c, ctx, syncFns) : c));
    } else if (v && typeof v.type === 'string') {
      node[key] = transformNode(v, ctx, syncFns);
    }
  }

  if (node.type === 'CallExpression' && !ctx) {
    // `await` su ogni chiamata (anche annidata). I nodi già trasformati sono figli.
    return { type: 'AwaitExpression', argument: node, start: node.start, end: node.end } as any;
  }
  return node;
}
