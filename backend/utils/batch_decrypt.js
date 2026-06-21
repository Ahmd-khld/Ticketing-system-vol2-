const { decryptDeterministic } = require('./encryption');
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const list = JSON.parse(input);
    const out = {};
    for (const t of list) {
      out[t] = decryptDeterministic(t);
    }
    console.log(JSON.stringify(out));
  } catch(e) {
    console.log(JSON.stringify({}));
  }
});
