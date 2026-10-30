import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function runTest(overflowValue, outFile) {
  return new Promise((resolve) => {
    const html = `<!doctype html>
<html>
<head>
<style>
body { margin: 0; width: 800px; height: 600px; background: #eef0f5; }
.dialog {
  width: 400px;
  height: 200px;
  margin: 100px auto;
  border: 1px solid #ccc;
  border-radius: 16px;
  background: white;
  overflow: ${overflowValue};
}
.cursor {
  position: fixed;
  left: 0;
  top: 0;
  width: 20px;
  height: 20px;
  background: rgb(0, 0, 255);
  border-radius: 50%;
  pointer-events: none;
  z-index: 100000;
  transform: translate3d(50px, 50px, 0); /* outside the dialog */
}
</style>
</head>
<body>
<dialog class="dialog" id="dlg">
  <p>Dialog Content</p>
  <div class="cursor" id="c"></div>
</dialog>
<script>
  document.getElementById('dlg').showModal();
</script>
</body>
</html>`;
    const htmlFile = `temp-${overflowValue}.html`;
    writeFileSync(htmlFile, html);
    const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const child = spawn(chromePath, [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      `--screenshot=${outFile}`,
      '--window-size=800,600',
      htmlFile
    ]);
    child.on('close', () => resolve());
  });
}

await runTest('auto', 'temp-auto.png');
await runTest('visible', 'temp-visible.png');
console.log('Both screenshots taken.');
