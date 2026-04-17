const { app, BrowserWindow, dialog } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { spawn, spawnSync } = require("node:child_process");
const http = require("node:http");

const isDev = !app.isPackaged;
const FRONTEND_PORT = 4173;
const BACKEND_PORT = 5000;

const iconPath = isDev
  ? path.join(__dirname, "..", "..", "media", "DreamRT_SQRE_wp.png")
  : path.join(process.resourcesPath, "assets", "DreamRT_SQRE_wp.png");

const backendRoot = isDev
  ? path.join(__dirname, "..", "..", "backend")
  : path.join(process.resourcesPath, "backend-runtime");
const backendMain = path.join(backendRoot, "main.py");
const backendExe = path.join(backendRoot, "dreamrt-backend.exe");

const distRoot = isDev
  ? path.join(__dirname, "..", "dist")
  : path.join(process.resourcesPath, "app.asar", "dist");

let backendProcess = null;
let frontendServer = null;

function getContentType(filePath) {
  if (filePath.endsWith(".html")) return "text/html; charset=utf-8";
  if (filePath.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (filePath.endsWith(".css")) return "text/css; charset=utf-8";
  if (filePath.endsWith(".json")) return "application/json; charset=utf-8";
  if (filePath.endsWith(".png")) return "image/png";
  if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) return "image/jpeg";
  if (filePath.endsWith(".svg")) return "image/svg+xml";
  if (filePath.endsWith(".ico")) return "image/x-icon";
  return "application/octet-stream";
}

function startBackend() {
  const backendDataDir = path.join(app.getPath("userData"), "backend-data");
  fs.mkdirSync(backendDataDir, { recursive: true });

  if (!isDev && fs.existsSync(backendExe)) {
    backendProcess = spawn(backendExe, [], {
      cwd: backendRoot,
      env: {
        ...process.env,
        DREAMRT_BACKEND_ROOT: backendRoot,
        DREAMRT_BACKEND_DATA_DIR: backendDataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    backendProcess.stdout.on("data", (chunk) => {
      process.stdout.write(`[backend] ${chunk}`);
    });
    backendProcess.stderr.on("data", (chunk) => {
      process.stderr.write(`[backend] ${chunk}`);
    });
    return;
  }

  if (!fs.existsSync(backendMain)) {
    throw new Error(`Backend entrypoint not found: ${backendMain}`);
  }

  const candidates = process.platform === "win32" ? ["py", "python", "python3"] : ["python3", "python"];
  for (const command of candidates) {
    const check = spawnSync(command, ["--version"], { stdio: "ignore" });
    if (check.status !== 0) {
      continue;
    }

    try {
      const proc = spawn(command, [backendMain], {
        cwd: backendRoot,
        env: {
          ...process.env,
          DREAMRT_BACKEND_ROOT: backendRoot,
          DREAMRT_BACKEND_DATA_DIR: backendDataDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      proc.stdout.on("data", (chunk) => {
        process.stdout.write(`[backend] ${chunk}`);
      });
      proc.stderr.on("data", (chunk) => {
        process.stderr.write(`[backend] ${chunk}`);
      });

      proc.on("exit", (code) => {
        if (code !== 0) {
          console.error(`Backend exited with code ${code}`);
        }
      });

      backendProcess = proc;
      return;
    } catch {
      // try next command candidate
    }
  }

  throw new Error("Unable to launch Python backend. Install Python and ensure it's in PATH.");
}

function waitForBackend(timeoutMs = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryPing = () => {
      const req = http.get(`http://127.0.0.1:${BACKEND_PORT}/api/edf/info?mode=live`, (res) => {
        res.resume();
        resolve();
      });

      req.on("error", () => {
        if (Date.now() - start >= timeoutMs) {
          reject(new Error("Backend did not become ready in time."));
          return;
        }
        setTimeout(tryPing, 350);
      });
    };

    tryPing();
  });
}

function startFrontendServer() {
  if (!fs.existsSync(path.join(distRoot, "index.html"))) {
    throw new Error(`Frontend build files missing: ${distRoot}`);
  }

  frontendServer = http.createServer((req, res) => {
    const requestUrl = req.url || "/";

    if (requestUrl.startsWith("/api")) {
      const proxyReq = http.request(
        {
          hostname: "127.0.0.1",
          port: BACKEND_PORT,
          path: requestUrl,
          method: req.method,
          headers: req.headers,
        },
        (proxyRes) => {
          res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
          proxyRes.pipe(res);
        }
      );
      proxyReq.on("error", () => {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: false, error: "Backend unavailable" }));
      });
      req.pipe(proxyReq);
      return;
    }

    const normalized = requestUrl.split("?")[0];
    const relativePath = normalized === "/" ? "/index.html" : normalized;
    const localPath = path.normalize(path.join(distRoot, relativePath));

    if (!localPath.startsWith(path.normalize(distRoot))) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    const servePath = fs.existsSync(localPath) && fs.statSync(localPath).isFile()
      ? localPath
      : path.join(distRoot, "index.html");

    fs.readFile(servePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end("Failed to load application");
        return;
      }
      res.writeHead(200, { "Content-Type": getContentType(servePath) });
      res.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    frontendServer.once("error", reject);
    frontendServer.listen(FRONTEND_PORT, "127.0.0.1", () => resolve());
  });
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "DreamRT",
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
  } else {
    mainWindow.loadURL(`http://127.0.0.1:${FRONTEND_PORT}`);
  }
}

app.whenReady().then(async () => {
  try {
    if (!isDev) {
      startBackend();
      await waitForBackend();
      await startFrontendServer();
    }
    createMainWindow();
  } catch (error) {
    dialog.showErrorBox("DreamRT startup error", String(error?.message || error));
    app.quit();
    return;
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (frontendServer) {
    frontendServer.close();
  }
  if (backendProcess && !backendProcess.killed) {
    backendProcess.kill();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
