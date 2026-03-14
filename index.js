const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store for transactions
const transactions = {};

// Generate a random transaction reference
function generateReference() {
  return 'txn_' + Math.random().toString(36).substring(2, 15);
}

// API: Initialize payment
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

// API: Verify payment
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

// Serve frontend pages (already handled by express.static)
// But we add a catch-all to serve index.html for any unknown routes (SPA-like)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});