const express = require("express");
const router = express.Router();
const Request = require("../models/Request");
const User = require("../models/User");

router.post("/create", async (req, res) => {
  const { message, image, category } = req.body;
  const userId = req.user.id;
  const userLocation = req.user.location;
  const request = new Request({
    userId,
    message,
    image,
    category,
    location: userLocation,
  });
  try {
    await request.save();
    const recipients = await User.find({
      location: {
        $near: {
          $geometry: userLocation,
          $maxDistance: 600 * 1609.34, // 600 acres in meters
        },
      },
    });
    request.recipients = recipients.map((user) => user.id);
    await request.save();
    res.send({ message: "Request created successfully" });
  } catch (err) {
    res.status(400).send({ message: "Error creating request" });
  }
});

router.get("/notifications", async (req, res) => {
  const userId = req.user.id;
  const requests = await Request.find({ recipients: userId });
  res.send(requests);
});

router.post("/accept", async (req, res) => {
  const requestId = req.body.requestId;
  const userId = req.user.id;
  const request = await Request.findById(requestId);
  if (!request) {
    return res.status(404).send({ message: "Request not found" });
  }
  request.recipients.pull(userId);
  await request.save();
  res.send({ message: "Request accepted successfully" });
});

router.post("/decline", async (req, res) => {
  const requestId = req.body.requestId;
  const userId = req.user.id;
  const request = await Request.findById(requestId);
  if (!request) {
    return res.status(404).send({ message: "Request not found" });
  }
  request.recipients.pull(userId);
  await request.save();
  res.send({ message: "Request declined successfully" });
});

module.exports = router;
