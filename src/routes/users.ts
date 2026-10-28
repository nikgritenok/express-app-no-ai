import { Router } from "express";

const router = Router();

router.get("/", (_req, res) => {
  res.send("respond with a resource");
});

export default router;
