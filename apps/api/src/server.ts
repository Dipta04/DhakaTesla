import "dotenv/config";
import { app } from "./app.js";
import { db } from "./db.js";

const port = Number(process.env.PORT || 4000);
const server = app.listen(port, "0.0.0.0", () => console.info(`Tesla API listening on ${port}`));
async function shutdown() {
  server.close();
  await db.$disconnect();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
