import fs from 'fs';

let content = fs.readFileSync('tests/admin-pages-ui-cutover.test.ts', 'utf8');

// replace all tests related to withAdminProjectContext
const str = `    it('appends ?projectId to plain paths', () => {`;
const str2 = `    it('preserves existing query parameters when adding projectId', () => {`;
const str3 = `    it('handles hashes correctly', () => {`;
const str4 = `    it('removes ?projectId when id is invalid or null', () => {`;

// Let's just remove the entire `describe('URL context propagation'` block which I didn't find before
const target = "    it('appends ?projectId to plain paths'";
const startIndex = content.indexOf(target);
if (startIndex !== -1) {
  // Let's just truncate the file from the start of the last describe block
  const blockStart = content.indexOf("  describe('2. ADMIN PAGES BROWSER ROUTING'");
  if (blockStart !== -1) {
    // wait, we shouldn't truncate the whole file!
  }
}
