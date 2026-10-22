// If someone double-clicks the HTML file, nothing works because there is no server.
// This tells them what to do. (It is a plain script, because module scripts cannot load from a file.)
if (location.protocol === 'file:') {
  var box = document.getElementById('msg');
  if (box) {
    box.textContent =
      'This page must be opened from the server. Start it with "npm start", then open http://localhost:3000 in your browser. Double-clicking the file does not work. See SETUP.md.';
    box.className = 'msg info';
  }
}
