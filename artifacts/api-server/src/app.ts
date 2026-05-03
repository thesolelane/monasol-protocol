import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { startVerificationWorker, startPingBatchWorker } from "./routes/watch";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

// Start background verification worker (runs every 5 min for pending, 30 min for active)
startVerificationWorker();

// Start oracle ping batch worker (flushes Tier 1 node pings to NeighborhoodWatch.vy every 5 min)
startPingBatchWorker();

export default app;
