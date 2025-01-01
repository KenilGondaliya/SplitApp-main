const express = require('express');
const Admin = require('../components/Admin');
const apiAuth = require('../helper/apiAuthentication');

const router = express.Router();

// Protect all admin routes with authentication
router.use(apiAuth.validateToken);

// User management routes
router.get('/users', Admin.getAllUsers);
router.get('/users/search', Admin.searchUsers);
router.get('/users/:id', Admin.getUserDetails);
router.put('/users/:id', Admin.editUser);
router.delete('/users/:id', Admin.deleteUser);

// Dashboard statistics
router.get('/stats', Admin.getUserStats);

module.exports = router;