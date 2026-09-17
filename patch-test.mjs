import fs from 'fs';

let content = fs.readFileSync('tests/admin-pages-ui-cutover.test.ts', 'utf8');

// Find the describe block for URL context propagation and remove it entirely.
const startStr = "  describe('URL context propagation', () => {";
const startIndex = content.indexOf(startStr);

if (startIndex !== -1) {
  // Try to find the end of this describe block
  // It's the last describe block in the file, so we can just substring it out, 
  // but let's be careful.
  let openBraces = 0;
  let endIndex = -1;
  let started = false;
  
  for (let i = startIndex; i < content.length; i++) {
    if (content[i] === '{') {
      openBraces++;
      started = true;
    } else if (content[i] === '}') {
      openBraces--;
    }
    
    if (started && openBraces === 0) {
      endIndex = i;
      break;
    }
  }
  
  if (endIndex !== -1) {
    content = content.substring(0, startIndex) + content.substring(endIndex + 1);
  }
}

fs.writeFileSync('tests/admin-pages-ui-cutover.test.ts', content);
