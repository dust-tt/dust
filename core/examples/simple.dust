input INPUT {
  expected: {question}
}

code FILTER {
  code:
```
_fun = (env) => {
  return {"q": env['state']['INPUT']['question']};
};
```
}

llm MODEL {
  max_tokens: 1024
  temperature: 0.7
  prompt:
```
${FILTER.q}
```
}

code POSTPROCESS {
  code:
```
_fun = (env) => {
  let completion = env['state']['MODEL']['completion'];
  return {
    "answer": completion["text"].trim(),
  };
}
```
}

