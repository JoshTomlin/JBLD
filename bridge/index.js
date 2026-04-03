console.log("BRIDGE SCRIPT STARTED");

const WebSocket = require("ws");

// Try to load a native Node BLE backend. Prefer @abandonware/noble, fall back to noble-winrt.
let noble = null;
try {
  noble = require("@abandonware/noble");
  console.log("Using @abandonware/noble for BLE");
} catch (e) {
  try {
    noble = require("noble-winrt");
    console.log("Using noble-winrt for BLE (Windows)");
  } catch (err) {
    noble = null;
    console.warn("No native noble available; will try webbluetooth fallback (may require a browser bridge)");
  }
}

const SERVICE_UUID_DATA = "0000fff0-0000-1000-8000-00805f9b34fb";
const CHRCT_UUID_F5 = "0000fff5-0000-1000-8000-00805f9b34fb"; // prev moves, move counter
const CHRCT_UUID_F6 = "0000fff6-0000-1000-8000-00805f9b34fb"; // time offsets

const wss = new WebSocket.Server({ port: 17433 });
console.log("WebSocket listening on ws://127.0.0.1:17433");

function broadcast(obj) {
  console.log("[bridge->ws] sending", JSON.stringify(obj));
  const msg = JSON.stringify(obj);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "status", msg: "bridge connected" }));
});

if (noble) {
  // Native noble-based bridge
  (function startNobleBridge() {
    console.log("Starting noble scan for GAN devices...");

    let connected = false;
    let prevMoveCnt = -1;

    noble.on("stateChange", (state) => {
      console.log("noble state:", state);
      if (state === "poweredOn") {
        // No service filter: scan for devices by name (GAN) and discover services dynamically
        try {
          noble.startScanning([], false);
          console.log("Started scanning (no service filter)");
        } catch (e) {
          console.error("Failed to start scanning:", e);
        }
      } else {
        noble.stopScanning();
      }
    });

    noble.on("discover", async (peripheral) => {
      const name = peripheral.advertisement && peripheral.advertisement.localName;
      if (!name || !/gan/i.test(name)) return;
      console.log("Found GAN device:", name, peripheral.id);
      noble.stopScanning();

      try {
        await new Promise((res, rej) => peripheral.connect((err) => (err ? rej(err) : res())));
        console.log("Connected to peripheral", peripheral.id);
        connected = true;

        peripheral.discoverAllServicesAndCharacteristics((err, services, characteristics) => {
          if (err) {
            console.error("Service discovery error:", err);
            return;
          }

          // Find characteristics by UUID fragment (fff2/fff5/fff6/fff7)
          const findBySuffix = (suf) => {
            suf = suf.replace(/-/g, "").toLowerCase();
            return characteristics.find((c) => c.uuid && c.uuid.toLowerCase().includes(suf));
          };

          const charF2 = findBySuffix('fff2');
          const charF5 = findBySuffix('fff5');
          const charF6 = findBySuffix('fff6');
          const charF7 = findBySuffix('fff7');

          if (charF5) {
            charF5.on("data", (data) => {
              try {
                // data is a Buffer
                const value = data;
                const moveCnt = value[12];
                if (moveCnt === prevMoveCnt) return;
                prevMoveCnt = moveCnt;
                // prev moves bytes at positions 13..18
                const prevMoves = [];
                for (let i = 0; i < 6; i++) {
                  const m = value[13 + i];
                  const face = "URFDLB".charAt(Math.floor(m / 3));
                  const pow = " 2'".charAt(m % 3);
                  prevMoves.unshift(face + pow);
                }

                // compute move mapping same as browser code
                const movesMap = {
                  0: "U",
                  1: "U2",
                  2: "U'",
                  3: "R",
                  4: "R2",
                  5: "R'",
                  6: "F",
                  7: "F2",
                  8: "F'",
                  9: "D",
                  10: "D2",
                  11: "D'",
                  12: "L",
                  13: "L2",
                  14: "L'",
                  15: "B",
                  16: "B2",
                  17: "B'",
                };

                // Decide which moves are new — heuristic: any prevMoves element that's not in a short history
                // For simplicity, broadcast all prevMoves (the UI will dedupe or append)
                for (let i = 0; i < prevMoves.length; i++) {
                  const pm = prevMoves[i];
                  const mIndex = "URFDLB".indexOf(pm[0]) * 3 + " 2'".indexOf(pm[1]);
                  const mv = movesMap[mIndex];
                  if (mv) broadcast({ type: "move", move: mv, t: Date.now() });
                }
              } catch (e) {
                console.error("Error parsing f5 data:", e);
              }
            });
            charF5.subscribe((err) => {
              if (err) console.error("Failed to subscribe to f5:", err);
              else console.log("Subscribed to f5 notifications");
            });
          }

          if (charF6) {
            charF6.on("data", (data) => {
              // time offsets parsing could be implemented here if needed
            });
            charF6.subscribe((err) => {
              if (err) console.error("Failed to subscribe to f6:", err);
              else console.log("Subscribed to f6 notifications");
            });
          }
        });
      } catch (err) {
        console.error("Failed to connect/discover on peripheral:", err);
        try {
          noble.startScanning([SERVICE_UUID_DATA], false);
        } catch (e) {}
      }
    });
  })();
} else {
  // Fallback: use existing webbluetooth + gan-web-bluetooth flow (kept for environments where webbluetooth is set up)
  (function startWebBluetoothBridge() {
    console.log("No native noble available — starting webbluetooth bridge fallback (requires webbluetooth package).");
    try {
      const { Bluetooth } = require("webbluetooth");
      const { connectGanCube } = require("gan-web-bluetooth");

      // gan-web-bluetooth expects navigator.bluetooth
      global.navigator = {};
      global.navigator.bluetooth = new Bluetooth({
        scanTime: 30,
        deviceFound: (device) => {
          const name = device?.name || "";
          console.log("FOUND:", JSON.stringify({ name, id: device?.id }, null, 0));
          return /gan/i.test(name);
        },
      });

      async function main() {
        console.log("Searching for GAN cube (webbluetooth)…");
        const conn = await connectGanCube();
        console.log("Connected via webbluetooth");

        conn.events$.subscribe((event) => {
          if (event.type === "MOVE") {
            console.log("MOVE:", event.move);
            broadcast({ type: "move", move: event.move, t: Date.now() });
          }
        });

        await conn.sendCubeCommand({ type: "REQUEST_FACELETS" });
        console.log("Ready — turn the cube (webbluetooth)");
        process.stdin.resume();
      }

      main().catch((e) => console.error("Fatal error (webbluetooth):", e));
    } catch (e) {
      console.error("webbluetooth fallback failed (missing packages):", e);
    }
  })();
}
