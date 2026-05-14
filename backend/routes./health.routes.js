const express = require('express');
const router  = express.Router();
const { getHealthSummary } = require('../controllers/health.controller');
const { verifyToken }      = require('../middleware/auth.middleware');

// All routes require a valid JWT
router.use(verifyToken);

// GET /api/health → full health summary aggregated from all tables
router.get('/', getHealthSummary);

module.exports = router;