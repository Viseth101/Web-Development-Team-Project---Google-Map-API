// 1. Load the dotenv package FIRST
require('dotenv').config();

const express = require('express');
const app = express();

// 2. Access your hidden key using process.env
const myApiKey = process.env.GOOGLE_API_KEY;

// Just to test if it works! (Delete this console.log before pushing to GitHub)
// console.log("My secret key is loaded:", myApiKey);

app.listen(5000, () => {
    console.log('Backend server is running on port 5000');
});