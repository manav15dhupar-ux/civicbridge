/**
 * @fileoverview Express router for querying Pune civic authorities directory.
 */

import express from "express";
import { getAuthorities } from "../services/actionPlanService.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

/**
 * GET /api/authorities
 * Returns full registry of municipal and state civic authorities in Pune.
 */
router.get(
  "/",
  asyncHandler(async (req, res) => {
    const authorities = await getAuthorities();
    return res.json({
      success: true,
      count: authorities.length,
      data: authorities
    });
  })
);

/**
 * GET /api/authorities/:id
 * Returns a specific authority by ID.
 */
router.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const authorities = await getAuthorities();
    const found = authorities.find((a) => a.id === req.params.id);
    if (!found) {
      return res.status(404).json({
        success: false,
        error: `Authority '${req.params.id}' not found in registry.`
      });
    }
    return res.json({
      success: true,
      data: found
    });
  })
);

export default router;
