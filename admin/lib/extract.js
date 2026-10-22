// 从 .ts 源码中提取 export const NAME = <字面量> 的内容并求值
// 目的：把小程序里的默认配置（INTENT_RULES / QUOTES / LLM_PRESETS /
//       DEFAULT_PROMPTS / DEFAULT_CRAWL_TOPICS）作为后台的"默认值"，
//       保证后台和小程序永远同源，不会因为手抄而漂移。
//
// 只支持纯字面量（对象/数组/字符串/数字/布尔），内部不引用外部变量，
// 这点与现有 config_cli.py 的解析前提一致。

function skipString(src, i) {
  const q = src[i];
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === q) { i += 1; break; }
    i += 1;
  }
  return i;
}

function scanTemplate(src, i) {
  // src[i] === '`'
  i += 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { i += 1; break; }
    if (c === '$' && src[i + 1] === '{') {
      let depth = 0;
      let j = i + 1;
      while (j < src.length) {
        const ch = src[j];
        if (ch === '{') depth += 1;
        else if (ch === '}') { depth -= 1; if (depth === 0) { j += 1; break; } }
        else if (ch === '"' || ch === "'" || ch === '`') j = skipString(src, j);
        j += 1;
      }
      i = j;
      continue;
    }
    i += 1;
  }
  return i;
}

function matchClose(src, openIdx) {
  const open = src[openIdx];
  const close = open === '{' ? '}' : open === '[' ? ']' : ')';
  let depth = 0;
  let i = openIdx;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") { i = skipString(src, i); continue; }
    if (c === '`') { i = scanTemplate(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return i + 1; }
    i += 1;
  }
  return -1;
}

// 提取指定名称的 export const 字面量并求值
function extractExport(source, name) {
  const re = new RegExp('export\\s+const\\s+' + name + '\\b');
  const m = re.exec(source);
  if (!m) return undefined;
  let i = m.index + m[0].length;
  // 跳到赋值符号 '='
  while (i < source.length && source[i] !== '=') i += 1;
  i += 1;
  // 找到首个开括号
  let openIdx = -1;
  for (; i < source.length; i += 1) {
    const c = source[i];
    if (c === '{' || c === '[' || c === '(') { openIdx = i; break; }
    if (!/\s/.test(c)) break; // 遇到非空白非括号，异常放弃
  }
  if (openIdx < 0) return undefined;
  const end = matchClose(source, openIdx);
  if (end < 0) return undefined;
  const code = source.slice(openIdx, end);
  try {
    // 信任的本地源码，求值字面量
    // eslint-disable-next-line no-new-func
    return new Function('return (' + code + ');')();
  } catch (e) {
    console.error('[extract] 求值失败:', name, e.message);
    return undefined;
  }
}

module.exports = { extractExport };
