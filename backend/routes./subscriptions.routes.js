const express = require('express');
const router  = express.Router();
const {
  getSubscriptions,
  createSubscription,
  updateSubscription,
  deleteSubscription
} = require('../controllers/subscriptions.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require a valid JWT
router.use(verifyToken);

// GET    /api/subscriptions       → list all subscriptions + leakage summary
// POST   /api/subscriptions       → create new subscription
// PUT    /api/subscriptions/:id   → update subscription
// DELETE /api/subscriptions/:id   → delete subscription
router.get('/',       getSubscriptions);
router.post('/',      createSubscription);
router.put('/:id',    updateSubscription);
router.delete('/:id', deleteSubscription);

module.exports = router;