const express = require('express');
const router  = express.Router();
const {
  getBudgets,
  createBudget,
  updateBudget,
  deleteBudget
} = require('../controllers/buget.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes require a valid JWT
router.use(verifyToken);

// GET    /api/budgets          → list budgets for month (+ real spent)
// POST   /api/budgets          → create new budget
// PUT    /api/budgets/:id      → update limit
// DELETE /api/budgets/:id      → delete budget
router.get('/',     getBudgets);
router.post('/',    createBudget);
router.put('/:id',  updateBudget);
router.delete('/:id', deleteBudget);

module.exports = router;