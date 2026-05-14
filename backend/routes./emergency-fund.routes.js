const express = require('express');
const router  = express.Router();
const {
  getEmergencyFund,
  saveEmergencyFund,
  resetEmergencyFund,
} = require('../controllers/emergency-fund.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require a valid JWT
router.use(verifyToken);

// GET    /api/emergency-fund  → load saved settings + computed metrics
// POST   /api/emergency-fund  → save / update settings (upsert)
// DELETE /api/emergency-fund  → reset back to defaults
router.get('/',    getEmergencyFund);
router.post('/',   saveEmergencyFund);
router.delete('/', resetEmergencyFund);

module.exports = router;