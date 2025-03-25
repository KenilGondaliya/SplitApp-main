const model = require("../model/schema");
const logger = require("../helper/logger");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * Create a new payment order
 * @route POST /api/payments/create-order
 */
exports.createPaymentOrder = async (req, res) => {
  try {
    const {
      amount,
      currency = "INR",
      settleTo,
      settleFrom,
      groupId,
    } = req.body;

    if (!groupId) {
      const err = new Error("Group ID is required");
      err.status = 400;
      throw err;
    }

    const group = await model.Group.findOne({ _id: groupId });
    if (!group) {
      const err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }

    // Validate group members
    if (!Array.isArray(group.groupMembers)) {
      logger.error(`groupMembers is not an array: ${JSON.stringify(group)}`);
      const err = new Error("Group members data is invalid or missing");
      err.status = 500;
      throw err;
    }

    if (
      !group.groupMembers.includes(settleFrom) ||
      !group.groupMembers.includes(settleTo)
    ) {
      const err = new Error("Settling users must be group members");
      err.status = 400;
      throw err;
    }

    // Create Razorpay order
    const options = {
      amount: amount * 100, // Razorpay expects amount in smallest currency unit (paise)
      currency,
      receipt: `settle_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);

    // Create settlement record
    const settleDate = new Date().toISOString();
    const settlement = new model.Settlement({
      groupId,
      settleTo,
      settleFrom,
      settleAmount: amount,
      settleDate,
      status: 'pending',
      orderId: order.id
    });
    await settlement.save();

    logger.info(`Settlement created: ${JSON.stringify(settlement)}`);

    res.status(200).json({
      status: "Success",
      order_id: order.id,
      amount: order.amount,
      currency: order.currency,
      settleTo,
      settleFrom,
      settlementId: settlement._id.toString(),
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Verify payment and update balances
 * @route POST /api/payments/verify
 */
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      settleTo,
      settleFrom,
      amount,
      settlementId,
    } = req.body;

    // Verify payment signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      throw new Error("Invalid payment signature");
    }

    // Find and validate settlement
    const settlement = await model.Settlement.findOne({ _id: settlementId });
    if (!settlement) {
      logger.error(`Settlement not found for ID: ${settlementId}`);
      throw new Error("Settlement record not found");
    }

    // Find and validate group
    const group = await model.Group.findById(settlement.groupId);
    if (!group) {
      throw new Error("Group not found");
    }

    // Initialize split if needed
    if (
      !Array.isArray(group.split) ||
      group.split.length === 0 ||
      !group.split[0] ||
      typeof group.split[0] !== "object"
    ) {
      logger.warn(
        `verifyPayment - Invalid split data for group ${settlement.groupId}, initializing: ${JSON.stringify(group.split)}`
      );
      group.split = [{}];
    }

    // Update split balances
    group.split[0][settleFrom] = (group.split[0][settleFrom] || 0) - amount;
    group.split[0][settleTo] = (group.split[0][settleTo] || 0) + amount;

    // Clean up zero balances
    if (group.split[0][settleFrom] === 0) {
      delete group.split[0][settleFrom];
    }
    if (group.split[0][settleTo] === 0) {
      delete group.split[0][settleTo];
    }

    // Update settlement status
    settlement.status = 'completed';
    settlement.paymentId = razorpay_payment_id;
    settlement.completedAt = new Date();
    await settlement.save();

    // Save group changes
    await group.save();

    res.status(200).json({
      status: "Success",
      message: "Payment verified and balances updated",
      payment_id: razorpay_payment_id,
      updatedSplit: group.split[0]
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Get all settlements for a group
 * @route GET /api/payments/group-settlements
 */
exports.getGroupSettlements = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId) {
      throw new Error("Group ID is required");
    }

    const settlements = await model.Settlement.find({ 
      groupId,
    }).sort({ settleDate: -1 });

    res.status(200).json({
      status: "Success",
      settlements
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Get user's settlement history
 * @route GET /api/payments/user-settlements
 */
exports.getUserSettlements = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const settlements = await model.Settlement.find({
      $or: [
        { settleTo: userId },
        { settleFrom: userId }
      ]
    }).sort({ settleDate: -1 });

    res.status(200).json({
      status: "Success",
      settlements
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Get pending settlements for a user
 * @route GET /api/payments/pending-settlements
 */
exports.getPendingSettlements = async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      throw new Error("User ID is required");
    }

    const settlements = await model.Settlement.find({
      $or: [
        { settleTo: userId },
        { settleFrom: userId }
      ],
      status: 'pending'
    }).sort({ settleDate: -1 });

    res.status(200).json({
      status: "Success",
      settlements
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Cancel a pending settlement
 * @route POST /api/payments/cancel-settlement
 */
exports.cancelSettlement = async (req, res) => {
  try {
    const { settlementId } = req.body;

    if (!settlementId) {
      throw new Error("Settlement ID is required");
    }

    const settlement = await model.Settlement.findOne({ _id: settlementId });
    
    if (!settlement) {
      throw new Error("Settlement not found");
    }

    if (settlement.status !== 'pending') {
      throw new Error("Only pending settlements can be cancelled");
    }

    // Cancel the Razorpay order if it exists
    if (settlement.orderId) {
      try {
        await razorpay.orders.cancel(settlement.orderId);
      } catch (error) {
        logger.error(`Failed to cancel Razorpay order: ${error.message}`);
      }
    }

    settlement.status = 'cancelled';
    settlement.cancelledAt = new Date();
    await settlement.save();

    res.status(200).json({
      status: "Success",
      message: "Settlement cancelled successfully",
      settlement
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/**
 * Get settlement statistics for a group
 * @route GET /api/payments/settlement-stats
 */
exports.getSettlementStats = async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!groupId) {
      throw new Error("Group ID is required");
    }

    const stats = await model.Settlement.aggregate([
      {
        $match: { 
          groupId,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$settleAmount" },
          count: { $sum: 1 },
          averageAmount: { $avg: "$settleAmount" }
        }
      }
    ]);

    const monthlyStats = await model.Settlement.aggregate([
      {
        $match: {
          groupId,
          status: 'completed'
        }
      },
      {
        $group: {
          _id: {
            year: { $year: "$settleDate" },
            month: { $month: "$settleDate" }
          },
          totalAmount: { $sum: "$settleAmount" },
          count: { $sum: 1 }
        }
      },
      {
        $sort: {
          "_id.year": -1,
          "_id.month": -1
        }
      }
    ]);

    res.status(200).json({
      status: "Success",
      stats: stats[0] || {
        totalAmount: 0,
        count: 0,
        averageAmount: 0
      },
      monthlyStats
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status || 500} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

module.exports = exports; 