# Rave Clone API

A simple payment API built with Node.js/Express, mimicking Rave (Flutterwave) endpoints.

## Endpoints

- `POST /api/initialize` – Create a new payment transaction.  
  Body: `{ "amount": 5000, "email": "user@example.com" }`  
  Response: Returns a transaction reference.

- `GET /api/verify/:reference` – Check the status of a transaction using its reference.

## Deployment

This app is ready to deploy on Render. Just connect your GitHub repository and Render will automatically use the `start` script.