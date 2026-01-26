import '../chunk-LGGOBZAG.mjs';
import assert from 'node:assert';
import { init, parse as parse$1 } from 'cjs-module-lexer';
import { parse } from 'es-module-lexer';
import MagicString from 'magic-string';

async function loader(source,map,meta){let callback=this.async();try{let magicString=new MagicString(source);try{let namedExportsOrder=((await parse(source))[1]||[]).map(e=>source.substring(e.s,e.e)).filter(e=>e!=="default");assert(namedExportsOrder.length>0,"No named exports found. Very likely that this is not a ES module."),magicString.append(`;export const __namedExportsOrder = ${JSON.stringify(namedExportsOrder)};`);}catch{await init();let namedExportsOrder=(parse$1(source).exports||[]).filter(e=>e!=="default"&&e!=="__esModule");assert(namedExportsOrder.length>0,"No named exports found. Very likely that this is not a CJS module."),magicString.append(`;module.exports.__namedExportsOrder = ${JSON.stringify(namedExportsOrder)};`);}return callback(null,magicString.toString(),map,meta)}catch{return callback(null,source,map,meta)}}

export { loader as default };
