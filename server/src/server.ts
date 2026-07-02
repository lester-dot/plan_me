import { buildApp } from "./app.js";
import { config } from "./config.js";
import { closeDb } from "./db/client.js";

async function main() {
  const app = await buildApp();
  try {
    await app.listen({ port: config.PORT, host: config.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async () => {
    await app.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main();
