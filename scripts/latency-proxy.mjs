/**
 * TCP proxy that adds a fixed one-way delay in each direction, used to simulate the network
 * distance between the app and its database when benchmarking locally.
 *   node scripts/latency-proxy.mjs <listenPort> <targetPort> <oneWayDelayMs>
 */
import net from "node:net";
const [listen, target, delay] = process.argv.slice(2).map(Number);
const later = (fn) => (delay > 0 ? setTimeout(fn, delay) : fn());
net.createServer((client) => {
  const upstream = net.connect(target, "127.0.0.1");
  client.setNoDelay(true); upstream.setNoDelay(true);
  client.on("data", (d) => later(() => upstream.write(d)));
  upstream.on("data", (d) => later(() => client.write(d)));
  const close = () => { client.destroy(); upstream.destroy(); };
  client.on("error", close); upstream.on("error", close); client.on("close", close); upstream.on("close", close);
}).listen(listen, "127.0.0.1", () => console.log(`proxy :${listen} -> :${target} (+${delay} ms each way)`));
