// notification.js
const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const User = require("../models/User");
const Notification = require("../models/Notification");
const twilioAccountSid = "ACd520aee912016b9451f6b62daebf5d33";
const twilioAuthToken = "a221fdde42ce042b6ee1ebaa164036ac";
const twilioClient = require("twilio")(twilioAccountSid, twilioAuthToken);

// Handle accept/decline notifications
router.post("/respond", authMiddleware, async (req, res) => {
  const { notificationId, response } = req.body;
  const userId = req.user.id;

  try {
    const notification = await Notification.findById(notificationId).populate(
      "requestId"
    );
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    if (response === "accept") {
      notification.status = "accepted";
      notification.message = `User ${userId} accepted the request`;

      // Update the notification status
      await notification.save();

      // Get the requester's phone number
      const requester = await User.findById(notification.requestId.userId);
      const requesterPhone = requester.phoneNumber;

      // Get the accepter's phone number
      const accepterPhone = req.user.phoneNumber;

      console.log(`Requester phone number: ${requesterPhone}`);
      console.log(`Acceptor phone number: ${accepterPhone}`);

      // Send a notification to the requester
      const requesterMessage = `Your request has been accepted by ${req.user.username}. You can contact them at +91${accepterPhone} for more details.`;
      try {
        const message = await twilioClient.messages.create({
          body: requesterMessage,
          from: "+15735704065",
          to: `+91${requesterPhone}`,
        });
        console.log(
          `Notification sent successfully to requester ${requester.id}`
        );
      } catch (error) {
        console.error(`Error sending SMS to requester: ${error}`);
      }

      // Send a notification to the accepter
      const accepterMessage = `You have accepted the request from ${requester.username}. You can contact them at +91${requesterPhone}.`;
      try {
        const message = await twilioClient.messages.create({
          body: accepterMessage,
          from: "+15735704065",
          to: `+91${accepterPhone}`,
        });
        console.log(
          `Notification sent successfully to accepter ${req.user.id}`
        );
      } catch (error) {
        console.error(`Error sending SMS to accepter: ${error}`);
      }
    } else if (response === "decline") {
      notification.status = "declined";
      notification.message = `User ${userId} declined the request`;
    }

    await notification.save();

    res.status(200).json({ message: "Response recorded" });
  } catch (error) {
    console.error("Error responding to notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
