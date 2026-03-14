const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// In-memory store for transactions
const transactions = {};

// Generate a random transaction reference
function generateReference() {
  return 'txn_' + Math.random().toString(36).substring(2, 15);
}

// POST /api/initialize – create a new payment
app.post('/api/initialize', (req, res) => {
  const { amount, email } = req.body;

  if (!amount || !email) {
    return res.status(400).json({ error: 'Amount and email are required' });
  }

  const reference = generateReference();
  transactions[reference] = {
    amount,
    email,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  res.json({
    status: 'success',
    message: 'Payment initialized',
    data: { reference, amount, email }
  });
});

// GET /api/verify/:reference – check transaction status
app.get('/api/verify/:reference', (req, res) => {
  const { reference } = req.params;
  const transaction = transactions[reference];

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  res.json({
    status: 'success',
    data: {
      reference,
      amount: transaction.amount,
      email: transaction.email,
      paymentStatus: transaction.status,
      createdAt: transaction.createdAt
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});