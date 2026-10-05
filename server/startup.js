export async function startLocalServer(server, { port, workspace, dataFile }) {
  const address = `http://127.0.0.1:${port}`;
  return new Promise(resolve => {
    server.once('error', async error => {
      if (error.code === 'EADDRINUSE') {
        try {
          const response = await fetch(`${address}/api/health`, { signal: AbortSignal.timeout(2000) });
          const health = await response.json();
          if (response.ok && health.app === 'unframe' && health.workspace === workspace) {
            console.log(`Unframe is already running at ${address}\nOpen this address in your browser. No second server is needed.\nTo restart it in development mode, stop the existing server in its terminal first.`);
            resolve(true);
            return;
          }
        } catch { /* Another application may be using this port. */ }
        console.error(`Cannot start Unframe: port ${port} is already in use by another server.\nStop that server, or choose another port in PowerShell:\n  $env:PORT = '3001'\n  npm.cmd start\nThen open the address printed by the server.`);
      } else {
        console.error(`Cannot start Unframe: ${error.message}`);
      }
      resolve(false);
    });
    server.listen(port, '127.0.0.1', () => {
      console.log(`Unframe is ready at ${address}\nKeep this terminal open while using the app. Press Ctrl+C to stop.\nLocal demo workspace · data saved to ${dataFile}`);
      resolve(true);
    });
  });
}
