const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');

router.post('/webhook/:gateway', depositController.processWebhook);

module.exports = router;