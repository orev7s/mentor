import { loadConfig, paths } from "./config.js";
import { AgentManager } from "./agent/manager.js";
import { createServer } from "./http/server.js";

const config = loadConfig();
const manager = new AgentManager();
const app = createServer(config, manager);

app.listen(config.port, config.host, () => {
  const url = `http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`;
  console.log("");
  console.log("  Mentor agent server");
  console.log("  -------------------");
  console.log(`  URL:    ${url}`);
  console.log(`  Token:  ${config.token}`);
  console.log(`  Data:   ${paths.dataDir}`);
  console.log("");
  console.log("  In the phone app, enter the server URL and this token.");
  console.log("");
});
