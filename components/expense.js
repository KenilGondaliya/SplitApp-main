const model = require("../model/schema");
const validator = require("../helper/validation");
const logger = require("../helper/logger");
const { addSplit, clearSplit } = require("./group");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/*
Add Expense function
This function is used to add expense to the group 
Accepts: Group ID not null group ID exist in the DB
         Expense Name - Not Null
         Expense Desc - max 100 limit
         Expense Amount not null
         Expense Owner - not null --member in the Group Expense Members not null members in the Group
         Auto-Generate Expense ID - Auto generated and stored in the database
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

    if (
      !Array.isArray(group.groupMembers) ||
      !group.groupMembers.includes(settleFrom) ||
      !group.groupMembers.includes(settleTo)
    ) {
      const err = new Error("Settling users must be group members");
      err.status = 400;
      throw err;
    }

    const options = {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: `settle_${Date.now()}`,
      payment_capture: 1,
    };

    const order = await razorpay.orders.create(options);
    const settleDate = new Date().toISOString();
    const settlement = new model.Settlement({
      groupId,
      settleTo,
      settleFrom,
      settleAmount: amount,
      settleDate,
    });
    await settlement.save();

    logger.info(
      `Payment order created: Order ID ${order.id}, Settlement ID ${settlement._id}`
    );

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
      `URL: ${req.originalUrl} | Status: ${err.status || 500} | Message: ${
        err.message
      } | Stack: ${err.stack}`
    );
    res.status(err.status || 500).json({ message: err.message });
  }
};

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

    // Verify Razorpay signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(razorpay_order_id + "|" + razorpay_payment_id)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      const err = new Error("Invalid payment signature");
      err.status = 400;
      throw err;
    }

    // Fetch settlement and group
    const settlement = await model.Settlement.findOne({ _id: settlementId });
    if (!settlement) {
      const err = new Error("Settlement record not found");
      err.status = 404;
      throw err;
    }

    const group = await model.Group.findById(settlement.groupId);
    if (!group) {
      const err = new Error("Group not found");
      err.status = 404;
      throw err;
    }

    // Initialize split if invalid
    if (
      !Array.isArray(group.split) ||
      group.split.length === 0 ||
      !group.split[0] ||
      typeof group.split[0] !== "object"
    ) {
      group.split = [{}];
    }

    logger.info(`Initial split: ${JSON.stringify(group.split[0])}`);

    group.split[0][settleFrom] = (group.split[0][settleFrom] || 0) + amount;
    group.split[0][settleTo] = (group.split[0][settleTo] || 0) - amount;

    if (group.split[0][settleFrom] === 0) delete group.split[0][settleFrom];
    if (group.split[0][settleTo] === 0) delete group.split[0][settleTo];

    logger.info(
      `Updated split after payment: ${JSON.stringify(group.split[0])}`
    );

    await model.Group.updateOne(
      { _id: group._id },
      { $set: { split: group.split } }
    );

    const expense = await model.Expense.findOne({
      groupId: settlement.groupId,
      expenseOwner: settleFrom,
      expenseMembers: settleTo,
    });

    if (expense) {
      const remainingAmount = expense.expenseAmount - amount;
      if (remainingAmount <= 0) {
        await model.Expense.deleteOne({ _id: expense._id });
        await model.Settlement.deleteOne({ _id: settlement._id });
        logger.info(
          `Full payment: Expense ${expense._id} and Settlement ${settlement._id} deleted`
        );
      } else {
        expense.expenseAmount = remainingAmount;
        expense.expensePerMember =
          remainingAmount / expense.expenseMembers.length;
        settlement.settleAmount = remainingAmount;
        await expense.save();
        await settlement.save();
        logger.info(
          `Partial payment: Expense ${expense._id} and Settlement ${settlement._id} updated`
        );
      }

      res.status(200).json({
        status: "Success",
        message:
          remainingAmount <= 0
            ? "Payment verified, expense fully cleared"
            : "Payment verified, expense partially updated",
        payment_id: razorpay_payment_id,
        settleAmount: remainingAmount > 0 ? remainingAmount : 0,
      });
    } else {
      if (amount >= settlement.settleAmount) {
        await model.Settlement.deleteOne({ _id: settlement._id });
        logger.info(`Full payment: Settlement ${settlement._id} deleted`);
        res.status(200).json({
          status: "Success",
          message: "Payment verified, settlement fully cleared",
          payment_id: razorpay_payment_id,
          settleAmount: 0,
        });
      } else {
        settlement.settleAmount -= amount;
        await settlement.save();
        logger.info(`Partial payment: Settlement ${settlement._id} updated`);
        res.status(200).json({
          status: "Success",
          message: "Payment verified, settlement partially cleared",
          payment_id: razorpay_payment_id,
          settleAmount: settlement.settleAmount,
        });
      }
    }
  } catch (err) {
    logger.error(
      `URL: ${req.originalUrl} | Status: ${err.status || 500} | Message: ${
        err.message
      } | Stack: ${err.stack}`
    );
    res.status(err.status || 500).json({ message: err.message });
  }
};

exports.addExpense = async (req, res) => {
  try {
    var expense = req.body;
    var group = await model.Group.findOne({ _id: expense.groupId });
    if (!group) {
      var err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }

    console.log(group);

    if (
      validator.notNull(expense.expenseName) &&
      validator.notNull(expense.expenseAmount) &&
      validator.notNull(expense.expenseOwner) &&
      validator.notNull(expense.expenseMembers) &&
      validator.notNull(expense.expenseDate)
    ) {
      var ownerValidation = await validator.groupUserValidation(
        expense.expenseOwner,
        expense.groupId
      );

      console.log(group);
      if (!ownerValidation) {
        var err = new Error("Please provide a valid group owner");
        err.status = 400;
        throw err;
      }
      for (var user of expense.expenseMembers) {
        var memberValidation = await validator.groupUserValidation(
          user,
          expense.groupId
        );
        if (!memberValidation) {
          var err = new Error("Please ensure the members exist in the group");
          err.status = 400;
          throw err;
        }
      }

      // Ensure group.split is initialized
      if (
        !Array.isArray(group.split) ||
        group.split.length === 0 ||
        !group.split[0] ||
        typeof group.split[0] !== "object"
      ) {
        logger.warn(
          `addExpense - Invalid split data for group ${
            expense.groupId
          }, initializing: ${JSON.stringify(group.split)}`
        );
        group.split = [{}];
        await model.Group.updateOne(
          { _id: expense.groupId },
          { $set: { split: group.split } }
        );
      }

      expense.expensePerMember =
        expense.expenseAmount / expense.expenseMembers.length;
      expense.expenseCurrency = group.groupCurrency;
      var newExp = new model.Expense(expense);
      var newExpense = await model.Expense.create(newExp);

      console.log(newExpense);

      // Update split values
      var update_response = await addSplit(
        expense.groupId,
        expense.expenseAmount,
        expense.expenseOwner,
        expense.expenseMembers
      );

      res.status(200).json({
        status: "Success",
        message: "New expenses added",
        Id: newExpense._id,
        splitUpdateResponse: update_response,
      });
    }
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Edit Expense function
This function is used to edit the previously added expense to the group
Accepts: Group ID not null group ID exist in the DB 
         Expense ID not null expense ID exist in the DB for the perticular group
         Expense Name Not Null
         Expense Desc max 100 limit Expense Amount not null
         Expense Owner - not null --member in the DB
         Expense Members not null members in the DB
*/
exports.editExpense = async (req, res) => {
  try {
    var expense = req.body;
    var oldExpense = await model.Expense.findOne({ _id: expense.id });
    if (
      !oldExpense ||
      expense.id == null ||
      oldExpense.groupId != expense.groupId
    ) {
      var err = new Error("Invalid Expense Id");
      err.status = 400;
      throw err;
    }

    if (
      validator.notNull(expense.expenseName) &&
      validator.notNull(expense.expenseAmount) &&
      validator.notNull(expense.expenseOwner) &&
      validator.notNull(expense.expenseMembers) &&
      validator.notNull(expense.expenseDate)
    ) {
      var ownerValidation = await validator.groupUserValidation(
        expense.expenseOwner,
        expense.groupId
      );
      if (!ownerValidation) {
        var err = new Error("Please provide a valid group owner");
        err.status = 400;
        throw err;
      }
      for (var user of expense.expenseMembers) {
        var memberValidation = await validator.groupUserValidation(
          user,
          expense.groupId
        );
        if (!memberValidation) {
          var err = new Error("Please ensure the members exist in the group");
          err.status = 400;
          throw err;
        }
      }

      var group = await model.Group.findOne({ _id: expense.groupId });
      if (
        !Array.isArray(group.split) ||
        group.split.length === 0 ||
        !group.split[0] ||
        typeof group.split[0] !== "object"
      ) {
        logger.warn(
          `editExpense - Invalid split data for group ${
            expense.groupId
          }, initializing: ${JSON.stringify(group.split)}`
        );
        group.split = [{}];
        await model.Group.updateOne(
          { _id: expense.groupId },
          { $set: { split: group.split } }
        );
      }

      var expenseUpdate = await model.Expense.updateOne(
        { _id: req.body.id },
        {
          $set: {
            groupId: expense.groupId,
            expenseName: expense.expenseName,
            expenseDescription: expense.expenseDescription,
            expenseAmount: expense.expenseAmount,
            expenseOwner: expense.expenseOwner,
            expenseMembers: expense.expenseMembers,
            expensePerMember:
              expense.expenseAmount / expense.expenseMembers.length,
            expenseType: expense.expenseType,
            expenseDate: expense.expenseDate,
          },
        }
      );

      await clearSplit(
        oldExpense.groupId,
        oldExpense.expenseAmount,
        oldExpense.expenseOwner,
        oldExpense.expenseMembers
      );
      await addSplit(
        expense.groupId,
        expense.expenseAmount,
        expense.expenseOwner,
        expense.expenseMembers
      );

      res.status(200).json({
        status: "Success",
        message: "Expense Edited",
        response: expenseUpdate,
      });
    }
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Delete Expense function
This function is used to deted the expense added to the group
Accepts: Group ID not null group ID exist in the DB 
         Expense ID not null expense ID exist in the DB for the perticular group
*/
exports.deleteExpense = async (req, res) => {
  try {
    var expense = await model.Expense.findOne({ _id: req.body.id });
    if (!expense) {
      var err = new Error("Invalid Expense Id");
      err.status = 400;
      throw err;
    }

    var group = await model.Group.findOne({ _id: expense.groupId });
    if (
      !Array.isArray(group.split) ||
      group.split.length === 0 ||
      !group.split[0] ||
      typeof group.split[0] !== "object"
    ) {
      logger.warn(
        `deleteExpense - Invalid split data for group ${
          expense.groupId
        }, initializing: ${JSON.stringify(group.split)}`
      );
      group.split = [{}];
      await model.Group.updateOne(
        { _id: expense.groupId },
        { $set: { split: group.split } }
      );
    }

    var deleteExp = await model.Expense.deleteOne({ _id: req.body.id });

    await clearSplit(
      expense.groupId,
      expense.expenseAmount,
      expense.expenseOwner,
      expense.expenseMembers
    );

    res.status(200).json({
      status: "Success",
      message: "Expense is deleted",
      response: deleteExp,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};
/*
View Individual Expense
This function is used to view individual expenses based on the expense ID 
Accepts: Expense Id
Returns: Json with the expense details
*/

exports.viewExpense = async (req, res) => {
  try {
    var expense = await model.Expense.findOne({
      _id: req.body.id,
    });
    if (expense.length == 0) {
      var err = new Error("No expense present for the Id");
      err.status = 400;
      throw err;
    }
    res.status(200).json({
      status: "Success",
      expense: expense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
View Group Expense function
This function is used to view all the group expense
Accepts: Group Id
Returns: Json with all the expense record and the total expense amount for the group
*/
exports.viewGroupExpense = async (req, res) => {
  try {
    var groupExpense = await model.Expense.find({
      groupId: req.body.id,
    }).sort({
      expenseDate: -1, //to get the newest first
    });
    if (groupExpense.length == 0) {
      var err = new Error("No expense present for the group");
      err.status = 400;
      throw err;
    }
    var totalAmount = 0;
    for (var expense of groupExpense) {
      totalAmount += expense["expenseAmount"];
    }
    res.status(200).json({
      status: "Success",
      expense: groupExpense,
      total: totalAmount,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
User Expense function
This function is used to find all the expense a user is involved in
Accepts user email Id
returns: Expenses
*/
exports.viewUserExpense = async (req, res) => {
  try {
    validator.notNull(req.body.user);
    var userExpense = await model.Expense.find({
      expenseMembers: req.body.user,
    }).sort({
      expenseDate: -1, //to get the newest first
    });
    if (userExpense.length == 0) {
      var err = new Error("No expense present for the user");
      err.status = 400;
      throw err;
    }
    var totalAmount = 0;
    for (var expense of userExpense) {
      totalAmount += expense["expensePerMember"];
    }
    res.status(200).json({
      status: "Success",
      expense: userExpense,
      total: totalAmount,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Recent User Expenses function
This function is used to return the latest 5 expenses a user is involved in 
Accepts : user email id - check in db if user is present 
Returns : top 5 most resent expense user is a expenseMember in all the groups  
*/
exports.recentUserExpenses = async (req, res) => {
  try {
    var recentExpense = await model.Expense.find({
      expenseMembers: req.body.user,
    })
      .sort({
        $natural: -1, //to get the newest first
      })
      .limit(5); //to get the top 5
    if (recentExpense.length == 0) {
      var err = new Error("No expense present for the user");
      err.status = 400;
      throw err;
    }
    res.status(200).json({
      status: "Success",
      expense: recentExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Category wise group expense calculator function 
This function is used to retuen the expense spend on each category in a group 
Accepts : groupID 
Returns : Each category total exp (group as whole)
*/
exports.groupCategoryExpense = async (req, res) => {
  try {
    var categoryExpense = await model.Expense.aggregate([
      {
        $match: {
          groupId: req.body.id,
        },
      },
      {
        $group: {
          _id: "$expenseCategory",
          amount: {
            $sum: "$expenseAmount",
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: categoryExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Group Monthly Expense Function 
This function is used to get the monthly amount spend in a group 
Accepts : group Id 
Returns : Expense per month (current year)
*/
exports.groupMonthlyExpense = async (req, res) => {
  try {
    var monthlyExpense = await model.Expense.aggregate([
      {
        $match: {
          groupId: req.body.id,
        },
      },
      {
        $group: {
          _id: {
            month: {
              $month: "$expenseDate",
            },
            year: {
              $year: "$expenseDate",
            },
          },
          amount: {
            $sum: "$expenseAmount",
          },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);
    res.status(200).json({
      status: "success",
      data: monthlyExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

new Date(new Date().setMonth(new Date().getMonth() - 5));
/*
Group Daily Expense Function 
This function is used to get the dailyly amount spend in a group 
Accepts : group Id 
Returns : Expense per day (current year)
*/
exports.groupDailyExpense = async (req, res) => {
  try {
    var dailyExpense = await model.Expense.aggregate([
      {
        $match: {
          groupId: req.body.id,
          expenseDate: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dayOfMonth: "$expenseDate",
            },
            month: {
              $month: "$expenseDate",
            },
            year: {
              $year: "$expenseDate",
            },
          },
          amount: {
            $sum: "$expenseAmount",
          },
        },
      },
      { $sort: { "_id.month": 1, "_id.date": 1 } },
    ]);
    res.status(200).json({
      status: "success",
      data: dailyExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
Category wise user expense calculator function 
This function is used to retuen the expense spend on each category for a user
Accepts : emailID
Returns : Each category total exp (individaul Expense)
*/
exports.userCategoryExpense = async (req, res) => {
  try {
    var categoryExpense = await model.Expense.aggregate([
      {
        $match: {
          expenseMembers: req.body.user,
        },
      },
      {
        $group: {
          _id: "$expenseCategory",
          amount: {
            $sum: "$expensePerMember",
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: categoryExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
User Monthly Expense Function 
This function is used to get the monthly amount spend by a user
Accepts : Email Id 
Returns : Expense per month
*/
exports.userMonthlyExpense = async (req, res) => {
  try {
    var monthlyExpense = await model.Expense.aggregate([
      {
        $match: {
          expenseMembers: req.body.user,
        },
      },
      {
        $group: {
          _id: {
            month: {
              $month: "$expenseDate",
            },
            year: {
              $year: "$expenseDate",
            },
          },
          amount: {
            $sum: "$expensePerMember",
          },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]);
    res.status(200).json({
      status: "success",
      data: monthlyExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

/*
User Daily Expense Function 
This function is used to get the daily amount spend by a user
Accepts : Email Id 
Returns : Expense per month
*/
exports.userDailyExpense = async (req, res) => {
  try {
    var dailyExpense = await model.Expense.aggregate([
      {
        $match: {
          expenseMembers: req.body.user,
          expenseDate: {
            $gte: new Date(new Date().setMonth(new Date().getMonth() - 1)),
            $lte: new Date(),
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dayOfMonth: "$expenseDate",
            },
            month: {
              $month: "$expenseDate",
            },
            year: {
              $year: "$expenseDate",
            },
          },
          amount: {
            $sum: "$expenseAmount",
          },
        },
      },
      { $sort: { "_id.month": 1, "_id.date": 1 } },
    ]);
    res.status(200).json({
      status: "success",
      data: dailyExpense,
    });
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | staus : ${err.status} | message: ${err.message}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};
