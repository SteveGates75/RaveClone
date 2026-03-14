// index.js
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON request bodies
app.use(express.json());

// In-memory storage for transactions
const transactions = {};

// Helper to generate a random reference
function generateReference() {
  return 'txn_' + Math.random().toString(36).substring(2, 15);
}

// Endpoint 1: Initialize payment
app.post('/api/initialize', (req, res) => {
  const { amount, email } = req.body;

  // Basic validation
  if (!amount || !email) {
    return res.status(400).json({ error: 'Amount and email are required' });
  }

  // Create a new transaction
  const reference = generateReference();
  transactions[reference] = {
    amount,
    email,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  // Return the reference (in a real app, you'd return a payment link)
  res.json({
    status: 'success',
    message: 'Payment initialized',
    data: {
      reference,
      amount,
      email
    }
  });
});

// Endpoint 2: Verify payment
app.get('/api/verify/:reference', (req, res) => {
  const { reference } = req.params;
  const transaction = transactions[reference];

  if (!transaction) {
    return res.status(404).json({ error: 'Transaction not found' });
  }

  // Simulate payment verification – in a real app, you'd check with a payment gateway
  // For demo, we'll just return the stored status
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});