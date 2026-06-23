import { Router, type IRouter } from "express";
import healthRouter from "./health";
import botRouter from "./bot";
import authRouter from "./auth";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/auth", authRouter);
router.use(healthRouter);

router.use(requireAuth);
router.use(botRouter);

export default router;
