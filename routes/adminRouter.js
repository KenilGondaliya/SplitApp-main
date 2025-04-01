const express = require('express');
const Admin = require('../components/Admin');

const router = express.Router();

// User management routes
router.get('/users', Admin.getAllUsers);
router.delete('/users/:id', Admin.deleteUser);

module.exports = router;