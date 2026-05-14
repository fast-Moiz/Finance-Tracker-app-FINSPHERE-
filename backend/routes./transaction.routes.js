const express = require('express');
const router = express.Router();
const {
  addTransaction,
  getTransactions,
  updateTransaction,
  deleteTransaction
} = require('../controllers/transaction.controller');
const { verifyToken } = require('../middleware/auth.middleware');

// All routes are protected — require valid JWT
router.use(verifyToken);

// GET    /api/transactions      → list all (for logged-in user)
// POST   /api/transactions      → add new
// PUT    /api/transactions/:id  → update existing
// DELETE /api/transactions/:id  → delete
router.get('/',     getTransactions);
router.post('/',    addTransaction);
router.put('/:id',  updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;