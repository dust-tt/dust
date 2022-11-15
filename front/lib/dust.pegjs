dust = (block)*

ws "whitespace" = [ \t\n\r]*

block_type = ws [a-z0-9\._]+ ws { return text().trim(); }
block_name = ws [A-Z0-9\_]+ ws { return text().trim(); }
block_body = ws "{" ws p:(pair)* ws "}" ws {
  let b = {};
  p.forEach((p) => { b[p[0]] = p[1] });
  return b;
}

key = [a-zA-Z0-9\._]+ { return text(); }
value = multiline / string

content = (!("```") .)+ { return text(); }
multiline = "```\n" c:content "```" { return c.slice(0, -1); }
string = !("\n" / "\r") [a-zA-Z0-9\._ ,/-]+ { return text(); }

pair = ws k:key ws ":" ws v:value ws { return [k, v]; }

block = t:block_type n:block_name s:block_body {
  return {
    type: t,
    name: n,
    spec: s
  };
}