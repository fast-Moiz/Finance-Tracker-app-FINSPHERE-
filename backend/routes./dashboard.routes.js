const express = require('express');
const router  = express.Router();
const {
  summary
} = require('../controllers/dashboardController');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes are protected — require valid JWT
router.use(verifyToken);

// GET /api/dashboard/summary → full dashboard data (balance, charts, transactions, bills, health score)
router.get('/summary', summary);

module.exports = router;