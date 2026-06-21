const io = require("socket.io-client");
const socket = io("http://localhost:5000");

socket.on("connect", () => {
  console.log("Connected to server");
});

socket.on("new_risk_detected", (risk) => {
  console.log("NEW RISK DETECTED: ", risk);
});

socket.on("grcLiveUpdate", (data) => {
  console.log("GRC UPDATE RECEIVED");
});

setTimeout(() => {
  console.log("Exiting after 35 seconds");
  process.exit(0);
}, 35000);
