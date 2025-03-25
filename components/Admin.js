const model = require("../model/schema");
const bcrypt = require("bcryptjs");
const logger = require("../helper/logger");

// Get all users with pagination
exports.getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Get users without password field
    const users = await model.User.find({}, { password: 0 })
      .skip(skip)
      .limit(limit);

    const total = await model.User.countDocuments();

    res.status(200).json({
      status: "Success",
      data: {
        users,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
      },
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

// Search users by any field
exports.searchUsers = async (req, res) => {
  try {
    const searchTerm = req.query.search;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    if (!searchTerm) {
      return res.status(400).json({
        message: "Search term is required",
      });
    }

    // Create search query for multiple fields
    const searchQuery = {
      $or: [
        { firstName: { $regex: searchTerm, $options: "i" } },
        { lastName: { $regex: searchTerm, $options: "i" } },
        { emailId: { $regex: searchTerm, $options: "i" } },
      ],
    };

    // Execute search
    const users = await model.User.find(searchQuery, { password: 0 })
      .skip(skip)
      .limit(limit);

    const total = await model.User.countDocuments(searchQuery);

    res.status(200).json({
      status: "Success",
      data: {
        users,
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalUsers: total,
      },
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

// Get single user details
exports.getUserDetails = async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await model.User.findById(userId, { password: 0 });

    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    res.status(200).json({
      status: "Success",
      data: user,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

// Edit user details
exports.editUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    // Remove fields that shouldn't be updated
    delete updates.password;
    delete updates.emailId; // Prevent email changes through this endpoint

    // Check if user exists
    const user = await model.User.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    // Validate updates
    if (updates.firstName && !updates.firstName.trim()) {
      const err = new Error("First name cannot be empty");
      err.status = 400;
      throw err;
    }

    // Update user
    const updatedUser = await model.User.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, select: "-password" }
    );

    res.status(200).json({
      status: "Success",
      message: "User updated successfully",
      data: updatedUser,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

// Delete user
exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Check if user exists
    const user = await model.User.findById(userId);
    if (!user) {
      const err = new Error("User not found");
      err.status = 404;
      throw err;
    }

    // Delete user
    await model.User.findByIdAndDelete(userId);

    // You might want to delete associated data here as well
    // For example, delete user's groups, expenses, etc.

    res.status(200).json({
      status: "Success",
      message: "User deleted successfully",
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

// Get user statistics for admin dashboard
exports.getUserStats = async (req, res) => {
  try {
    const totalUsers = await model.User.countDocuments();

    // Get new users in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const newUsers = await model.User.countDocuments({
      _id: {
        $gt: ObjectId.createFromTime(thirtyDaysAgo.getTime() / 1000),
      },
    });

    // Get users per month for the last 6 months
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const userGrowth = await model.User.aggregate([
      {
        $match: {
          _id: {
            $gt: ObjectId.createFromTime(sixMonthsAgo.getTime() / 1000),
          },
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$_id" },
            year: { $year: "$_id" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    res.status(200).json({
      status: "Success",
      data: {
        totalUsers,
        newUsersLast30Days: newUsers,
        userGrowth,
      },
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${
        err.message
      }`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};
