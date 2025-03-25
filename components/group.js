const model = require("../model/schema");
const validator = require("../helper/validation");
const logger = require("../helper/logger");
const splitCalculator = require("../helper/split");

/*
Create Group Function This function basically create new groups
Accepts: Group Name
         Group Description:
         Group Members
         Currency Type:
Validation: Group Name not empty
            Group Members present in DB
            Currency type INR, USD, EUR (for now)
*/
exports.createGroup = async (req, res) => {
  try {
    var newGroup = new model.Group(req.body);
    if (
      validator.notNull(newGroup.groupName) &&
      validator.currencyValidation(newGroup.groupCurrency)
    ) {
      var splitJson = {};
      for (var user of newGroup.groupMembers) {
        var memberCheck = await validator.userValidation(user);
        if (!memberCheck) {
          var err = new Error("Invalid member id");
          err.status = 400;
          throw err;
        }
        splitJson[user] = 0;
      }
      newGroup.split = [splitJson];

      var ownerCheck = await validator.userValidation(newGroup.groupOwner);
      if (!ownerCheck) {
        var err = new Error("Invalid owner id");
        err.status = 400;
        throw err;
      }

      var id = await model.Group.create(newGroup);
      res.status(200).json({
        status: "Success",
        message: "Group Creation Success",
        Id: id._id,
      });
    }
  } catch (err) {
    logger.error(
      `URL : ${req.originalUrl} | status : ${err.status} | message: ${err.message} ${err.stack}`
    );
    res.status(err.status || 500).json({
      message: err.message,
    });
  }
};

exports.addSplit = async (
  groupId,
  expenseAmount,
  expenseOwner,
  expenseMembers
) => {
  var group = await model.Group.findOne({ _id: groupId });
  if (!group) {
    throw new Error("Group not found");
  }

  if (
    !Array.isArray(group.split) ||
    group.split.length === 0 ||
    !group.split[0] ||
    typeof group.split[0] !== "object"
  ) {
    logger.warn(
      `addSplit - Invalid split data for group ${groupId}, initializing: ${JSON.stringify(
        group.split
      )}`
    );
    group.split = [{}];
  }

  group.groupTotal = (group.groupTotal || 0) + expenseAmount;
  group.split[0][expenseOwner] =
    (group.split[0][expenseOwner] || 0) + expenseAmount;
  const expensePerPerson =
    Math.round((expenseAmount / expenseMembers.length + Number.EPSILON) * 100) /
    100;

  for (var user of expenseMembers) {
    group.split[0][user] = (group.split[0][user] || 0) - expensePerPerson;
  }

  let bal = 0;
  for (let [_, value] of Object.entries(group.split[0])) {
    bal += value;
  }
  group.split[0][expenseOwner] -= bal;
  group.split[0][expenseOwner] =
    Math.round((group.split[0][expenseOwner] + Number.EPSILON) * 100) / 100;

  return await model.Group.updateOne({ _id: groupId }, group);
};

/*
View Group function 
This function is used to display the group details 
Accepts: Group Id 
Returns: Group Info 
*/
exports.viewGroup = async (req, res) => {
  try {
    const group = await model.Group.findOne({
      _id: req.body.id,
    });
    if (!group || req.body.id == null) {
      var err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }
    res.status(200).json({
      status: "Success",
      group: group,
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
Find all user group function
This function is basically to display the list of group that a user belongs
Accepts: user email ID
Validation: email Id present in DB
*/
exports.findUserGroup = async (req, res) => {
  try {
    const user = await model.User.findOne({
      emailId: req.body.emailId,
    });
    if (!user) {
      var err = new Error("User Id not found !");
      err.status = 400;
      throw err;
    }
    const groups = await model.Group.find({
      groupMembers: req.body.emailId,
    }).sort({
      $natural: -1, //to get the newest first
    });
    res.status(200).json({
      status: "Success",
      groups: groups,
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
Edit Group Function
This function is to edit the already existing group to make changes.
Accepts: Group Id
        Modified group info
*/
exports.editGroup = async (req, res) => {
  try {
    var group = await model.Group.findOne({ _id: req.body.id });
    if (!group || req.body.id == null) {
      var err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }

    var editGroup = new model.Group(req.body);
    editGroup.split = group.split;

    if (
      validator.notNull(editGroup.groupName) &&
      validator.currencyValidation(editGroup.groupCurrency)
    ) {
      for (var user of editGroup.groupMembers) {
        var memberCheck = await validator.userValidation(user);
        if (!memberCheck) {
          var err = new Error("Invalid member id");
          err.status = 400;
          throw err;
        }
        if (!editGroup.split[0].hasOwnProperty(user)) {
          editGroup.split[0][user] = 0;
        }
      }

      var ownerCheck = await validator.userValidation(editGroup.groupOwner);
      if (!ownerCheck) {
        var err = new Error("Invalid owner id");
        err.status = 400;
        throw err;
      }

      var update_response = await model.Group.updateOne(
        { _id: req.body.id },
        {
          $set: {
            groupName: editGroup.groupName,
            groupDescription: editGroup.groupDescription,
            groupCurrency: editGroup.groupCurrency,
            groupMembers: editGroup.groupMembers,
            groupCategory: editGroup.groupCategory,
            split: editGroup.split,
          },
        }
      );
      res.status(200).json({
        status: "Success",
        message: "Group updated successfully!",
        response: update_response,
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
Delete Group Function
This function is used to delete the existing group
Accepts: Group Id
Validation: exisitng group Id
*/
exports.deleteGroup = async (req, res) => {
  try {
    const group = await model.Group.findOne({
      _id: req.body.id,
    });
    if (!group) {
      var err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }
    var delete_group = await model.Group.deleteOne({
      _id: req.body.id,
    });
    res.status(200).json({
      message: "Group deleted successfully!",
      status: "Success",
      response: delete_group,
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
Make Settlement Function 
This function is used to make the settlements in the gorup 

*/
exports.makeSettlement = async (req, res) => {
  try {
    const { groupId, settleTo, settleFrom, settleAmount, settleDate } =
      req.body;

    // Validation
    if (!groupId || !settleTo || !settleFrom || !settleAmount || !settleDate) {
      const err = new Error(
        "All fields (groupId, settleTo, settleFrom, settleAmount, settleDate) are required"
      );
      err.status = 400;
      throw err;
    }

    const group = await model.Group.findOne({ _id: groupId });
    if (!group) {
      const err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }

    // Initialize split if invalid
    if (
      !Array.isArray(group.split) ||
      group.split.length === 0 ||
      !group.split[0] ||
      typeof group.split[0] !== "object"
    ) {
      logger.warn(
        `makeSettlement - Invalid split data for group ${groupId}, initializing`
      );
      group.split = [{}];
    }

    // Update split (settleFrom pays, settleTo receives)
    group.split[0][settleFrom] =
      (group.split[0][settleFrom] || 0) - settleAmount;
    group.split[0][settleTo] = (group.split[0][settleTo] || 0) + settleAmount;

    // Clean up zero balances
    if (group.split[0][settleFrom] === 0) delete group.split[0][settleFrom];
    if (group.split[0][settleTo] === 0) delete group.split[0][settleTo];

    // Save settlement and group
    const settlement = await model.Settlement.create(req.body);
    await group.save();

    logger.info(`Manual settlement created: ${settlement._id}`);

    res.status(200).json({
      status: "Success",
      message: "Settlement recorded successfully",
      settlementId: settlement._id,
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
/*
Clear Split function 
This function is used to clear the split caused due to a prev expense 
This is used guring edit expense or delete expense operation 
Works in the reverse of addSplit function 
*/
exports.clearSplit = async (
  groupId,
  expenseAmount,
  expenseOwner,
  expenseMembers
) => {
  var group = await model.Group.findOne({ _id: groupId });
  if (!group) {
    throw new Error("Group not found");
  }

  if (
    !Array.isArray(group.split) ||
    group.split.length === 0 ||
    !group.split[0] ||
    typeof group.split[0] !== "object"
  ) {
    logger.warn(
      `clearSplit - Invalid split data for group ${groupId}, initializing: ${JSON.stringify(
        group.split
      )}`
    );
    group.split = [{}];
  }

  group.groupTotal = (group.groupTotal || 0) - expenseAmount;
  group.split[0][expenseOwner] =
    (group.split[0][expenseOwner] || 0) - expenseAmount;
  const expensePerPerson =
    Math.round((expenseAmount / expenseMembers.length + Number.EPSILON) * 100) /
    100;

  for (var user of expenseMembers) {
    group.split[0][user] = (group.split[0][user] || 0) + expensePerPerson;
  }

  let bal = 0;
  for (let [_, value] of Object.entries(group.split[0])) {
    bal += value;
  }
  group.split[0][expenseOwner] -= bal;
  group.split[0][expenseOwner] =
    Math.round((group.split[0][expenseOwner] + Number.EPSILON) * 100) / 100;

  return await model.Group.updateOne({ _id: groupId }, group);
};
/*
Group Settlement Calculator 
This function is used to calculate the balnce sheet in a group, who owes whom 
Accepts : group Id 
return : group settlement detals
*/
exports.groupBalanceSheet = async (req, res) => {
  try {
    const group = await model.Group.findOne({ _id: req.body.id });
    if (!group || !req.body.id) {
      var err = new Error("Invalid Group Id");
      err.status = 400;
      throw err;
    }

    console.log("groupBalanceSheet - group.split:", group.split);

    if (
      !Array.isArray(group.split) ||
      group.split.length === 0 ||
      !group.split[0] ||
      typeof group.split[0] !== "object"
    ) {
      console.warn(
        "groupBalanceSheet - Invalid or empty split data:",
        group.split
      );
      res.status(200).json({
        status: "Success",
        data: [],
      });
      return;
    }

    const splitData = group.split[0];
    console.log("groupBalanceSheet - splitData:", splitData);

    const settlement = splitCalculator(splitData);
    res.status(200).json({
      status: "Success",
      data: settlement,
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
