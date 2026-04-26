import { Router, type IRouter } from "express";
import { storage } from "../storage";

const router: IRouter = Router();

// Application routes prefixed with /api
// use storage to perform CRUD operations on the storage interface
// e.g. storage.insertUser(user) or storage.getUserByUsername(username)

export default router;
