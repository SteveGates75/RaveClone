# Rave Clone - Full Stack Payment App

A simple clone of Rave (Flutterwave) payment gateway with a web interface.  
Built with Node.js, Express, and vanilla HTML/CSS/JavaScript.

## Features

- Initialize a payment (POST /api/initialize)
- Verify a payment using reference (GET /api/verify/:reference)
- Simple frontend forms to interact with the API

## How to Run Locally

1. Install [Node.js](https://nodejs.org/).
2. Clone this repository or download the files.
3. Open terminal in the project folder.
4. Run `npm install` to install dependencies.
5. Run `npm run dev` to start the server with auto-reload.
6. Open http://localhost:3000 in your browser.

## Deploy on Render

1. Push this code to a GitHub repository.
2. Log in to [Render](https://render.com).
3. Click **New +** → **Web Service**.
4. Connect your GitHub repo.
5. Render will detect Node.js; set:
   - Build Command: `npm install`
   - Start Command: `npm start`
6. Choose free plan and click **Create Web Service**.
7. Your app will be live at `https://your-app.onrender.com`.

## API Endpoints

- `POST /api/initialize`  
  Body: `{ "amount": 5000, "email": "user@example.com" }`  
  Returns a transaction reference.

- `GET /api/verify/:reference`  
  Returns transaction details.

## Notes

- All data is stored in memory (resets when server restarts).
- For a production app, add a database like MongoDB.