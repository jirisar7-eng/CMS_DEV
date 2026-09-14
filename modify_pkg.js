const fs = require('fs');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.engines = { node: "22.11.0", npm: "10.9.0" };
pkg.packageManager = "npm@10.9.0";
if (pkg.dependencies && pkg.dependencies.canonicalize) {
  pkg.dependencies.canonicalize = "5.0.0";
} else {
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies.canonicalize = "5.0.0";
}
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2));
