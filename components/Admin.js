const model = require("../model/schema");
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

    console.log(users);
    

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

    // Delete user's associated data
    // Delete user's groups where they are the owner
    await model.Group.deleteMany({ groupOwner: userId });

    // Remove user from group members in other groups
    await model.Group.updateMany(
      { groupMembers: userId },
      { $pull: { groupMembers: userId } }
    );

    // Delete user's expenses
    await model.Expense.deleteMany({ expenseOwner: userId });

    // Remove user from expense members in other expenses
    await model.Expense.updateMany(
      { expenseMembers: userId },
      { $pull: { expenseMembers: userId } }
    );

    // Delete settlements involving the user
    await model.Settlement.deleteMany({
      $or: [{ settleTo: userId }, { settleFrom: userId }],
    });

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
