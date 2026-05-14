const express = require('express');
const router  = express.Router();
const {
  getSavingsGoals,
  createSavingsGoal,
  addFunds,
  updateSavingsGoal,
  deleteSavingsGoal
} = require('../controllers/savings.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require a valid JWT
router.use(verifyToken);

// GET    /api/savings          → list all goals for this user
// POST   /api/savings          → create new goal
// PUT    /api/savings/:id      → edit goal name / target / deadline
// PUT    /api/savings/:id/funds→ add funds to a goal
// DELETE /api/savings/:id      → delete goal
router.get('/',              getSavingsGoals);
router.post('/',             createSavingsGoal);
router.put('/:id',           updateSavingsGoal);
router.put('/:id/funds',     addFunds);
router.delete('/:id',        deleteSavingsGoal);

module.exports = router;