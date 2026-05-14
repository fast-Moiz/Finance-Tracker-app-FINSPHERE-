const express = require('express');
const cors = require('cors');
require('dotenv').config();
const app = express();
// Allow your HTML frontend to talk to this backend
app.use(cors({
    origin: [
        'http://127.0.0.1:5500',
        'http://localhost:5500'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parse JSON data from requests
app.use(express.json());
const transactionRoutes = require('./src/routes/transaction.routes'); 
const authRoutes = require('./src/routes/auth.routes');
const budgetRoutes      = require('./src/routes/buget.routes');
const savingsRoutes = require('./src/routes/savings.routes');
const subscriptionRoutes = require('./src/routes/subscriptions.routes');
const emergencyFundRoutes = require('./src/routes/emergency-fund.routes');
const healthRoutes= require('./src/routes/health.routes');
const dashboardroutes=require('./src/routes/dashboard.routes.js');
app.use('/api/dashboard',  dashboardroutes);
app.use('/api/emergency-fund', emergencyFundRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/health',healthRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/budgets',      budgetRoutes); 
app.get('/ping', (req, res) => res.json({ status: 'Server is alive!' }));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
console.log(`■ FinSphere backend running at http://localhost:${PORT}`);
});

