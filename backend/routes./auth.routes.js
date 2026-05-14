const express = require('express');
const router = express.Router();
const {
  signup,
  login,
  forgotPassword,
  resetPassword,
  me
} = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');

router.post('/signup', signup);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/me', verifyToken, me); // ← add verifyToken here

module.exports = router;