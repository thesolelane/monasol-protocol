import { Router, type IRouter } from "express";
import healthRouter              from "./health";
import appRouter                 from "./routes";
import { oracleRouter }          from "./oracle";
import { watchRouter }           from "./watch";

const router: IRouter = Router();

router.use(healthRouter);
router.use(appRouter);
router.use("/oracle", oracleRouter);
router.use("/watch", watchRouter);

export default router;
