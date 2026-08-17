const fs = require("fs");

const sourcePath = "NCE1_阅读练习.html";
const outputPath = "learning-machine.html";
const scriptPaths = [
  "vendor/cloudbase.core.es5.js",
  "vendor/cloudbase.auth.es5.js",
  "vendor/cloudbase.database.es5.js",
  "cloud-sync.es5.js",
  "NCE1_阅读练习.es5.js",
];

const source = fs.readFileSync(sourcePath, "utf8");
const loaderStart = source.lastIndexOf(
  '  <script src="https://static.cloudbase.net/cloudbase-js-sdk/3.4.2/cloudbase.full.js"></script>'
);
const bodyEnd = source.lastIndexOf("</body>");

if (loaderStart < 0 || bodyEnd < loaderStart) throw new Error("Page loader section not found");

const scripts = scriptPaths.map((path) => {
  const content = fs.readFileSync(path, "utf8").trim();
  if (content.toLowerCase().includes("</script")) {
    throw new Error(`Unsafe script terminator in ${path}`);
  }
  return `  <script data-embedded-source="${path}">\n${content}\n  </script>`;
});

const bootstrap = `  <script>
    window.globalThis = window.globalThis || window;
    Object.values = Object.values || function (object) {
      return Object.keys(object).map(function (key) { return object[key]; });
    };
    Object.entries = Object.entries || function (object) {
      return Object.keys(object).map(function (key) { return [key, object[key]]; });
    };
    String.prototype.padStart = String.prototype.padStart || function (length, fill) {
      var value = String(this);
      var padding = String(fill || " ");
      while (value.length < length) value = padding + value;
      return value.slice(-length);
    };
    window.NCE_SINGLE_FILE_SYNC = true;
    window.NCE_SINGLE_FILE_BUILD = "20260817-reading-1";
  </script>`;

const output = source.slice(0, loaderStart)
  + bootstrap + "\n"
  + scripts.join("\n") + "\n"
  + source.slice(bodyEnd);

fs.writeFileSync(outputPath, output);
console.log(`${outputPath}: ${Buffer.byteLength(output)} bytes`);
