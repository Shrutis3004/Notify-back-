const express = require("express");
require("dotenv").config();
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const axios = require("axios");
const multer = require("multer");
const Request = require("../models/Request");
const Notification = require("../models/Notification");
const User = require("../models/User");
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const twilioClient = require("twilio")(twilioAccountSid, twilioAuthToken);
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage });
// Define the fetchUserLocation function
const fetchUserLocation = async () => {
  try {
    const response = await axios.get(
      "https://ip-geolocation-ipwhois-io.p.rapidapi.com/json/",
      {
        headers: {
          "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
          "X-RapidAPI-Host": "ip-geolocation-ipwhois-io.p.rapidapi.com",
        },
      }
    );

    if (!response.data || !response.data.latitude || !response.data.longitude) {
      console.error("Error fetching location: No results found");
      return { lat: 0, lon: 0 }; // Return a default location or null
    }

    const location = {
      lat: response.data.latitude,
      lon: response.data.longitude,
    };
    return location;
  } catch (error) {
    console.error("Error fetching location:", error);
    return null;
  }
};

// POST /api/requests endpoint to create a new request
router.post("/", authMiddleware, upload.single("image"), async (req, res) => {
  try {
    const location = await fetchUserLocation();
    if (!location) {
      return res.status(500).json({ error: "Failed to fetch location" });
    }

    const { type, message } = req.body;
    const userId = req.user.id;
    const userPhone = req.user.phoneNumber;
    const image = req.file ? req.file.path : null;

    const request = new Request({
      userId,
      type,
      message,
      image,
      location: {
        type: "Point",
        coordinates: [location.lon, location.lat],
      },
      userPhone,
    });

    await request.save();
    console.log("Request saved successfully");

    setTimeout(async () => {
      await Request.findByIdAndRemove(request._id);
    }, 24 * 60 * 60 * 1000);

    if (userPhone) {
      const formattedPhoneNumber = `+91${userPhone}`;
      const confirmationMessage = "Your request has been sent successfully.";
      await twilioClient.messages.create({
        body: confirmationMessage,
        from: "+17623202044",
        to: formattedPhoneNumber,
      });
      console.log("SMS notification sent successfully");
    }

    await notifyUsersInRadius(request, userId);

    res.status(201).send("Request created");
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.post("/:requestId/regenerate", authMiddleware, async (req, res) => {
  try {
    const request = await Request.findById(req.params.requestId);
    if (!request) {
      return res.status(404).json({ error: "Request not found" });
    }

    const twelveHours = 12 * 60 * 60 * 1000;
    const twentyFourHours = 24 * 60 * 60 * 1000;
    const timeElapsed = new Date() - new Date(request.createdAt);

    if (timeElapsed < twelveHours) {
      return res
        .status(400)
        .json({ error: "Cannot regenerate request before 12 hours" });
    }

    if (timeElapsed > twentyFourHours) {
      return res.status(400).json({
        error:
          "Request was generated more than 24 hours ago. Please refill the form.",
      });
    }

    // Logic to regenerate the request and send notifications
    await notifyUsersInRadius(request, request.userId);

    const user = await User.findById(request.userId);
    if (user && user.phoneNumber) {
      const message = "Your request has been regenerated successfully.";
      await sendSMS(user.phoneNumber, message);
    }

    res.status(200).send("Request regenerated successfully");
  } catch (error) {
    console.error("Error regenerating request:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.get("/history", authMiddleware, async (req, res) => {
  try {
    const requests = await Request.find({ userId: req.user.id }).sort({
      createdAt: -1,
    });
    res.status(200).json(requests);
  } catch (error) {
    console.error("Error fetching request history:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
// GET /api/requests endpoint
// GET /api/requests endpoint
router.get("/", authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .populate({
        path: "acceptedBy",
        select: "username", // Select fields you want to populate from User model
      })
      .populate("requestId");

    res.status(200).json(notifications);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});
router.post("/send-sms", async (req, res) => {
  try {
    const { message } = req.body;
    await twilioClient.messages.create({
      body: message,
      from: "+17623202044",
      to: "+916291153739",
    });
    console.log("SMS sent successfully");
    res.status(200).send("SMS sent");
  } catch (error) {
    console.error("Error sending SMS:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/requests/respond endpoint

router.post("/respond", authMiddleware, async (req, res) => {
  const { notificationId, response } = req.body;
  const userId = req.user.id;

  try {
    // Find the notification and populate the associated request
    const notification = await Notification.findById(notificationId).populate(
      "requestId"
    );
    if (!notification) {
      return res.status(404).json({ error: "Notification not found" });
    }

    // Ensure only the owner of the notification can respond
    if (notification.userId.toString() !== userId) {
      return res.status(403).json({ error: "Unauthorized to respond" });
    }

    // Update the notification status based on the response
    if (response === "accept") {
      // Update associated request status
      const request = await Request.findById(notification.requestId);
      if (request) {
        request.status = "accepted";
        await request.save();

        // Fetch all notifications related to the request
        const notificationsToUpdate = await Notification.find({
          requestId: notification.requestId,
        });

        // Update all related notifications to "accepted"
        for (const notif of notificationsToUpdate) {
          notif.status = "accepted";
          notif.acceptedBy = userId;
          await notif.save();
        }

        // Fetch the original request
        const originalRequest = await Request.findById(notification.requestId);

        // Notify the requester
        const requester = await User.findById(originalRequest.userId);
        if (requester && requester.phoneNumber) {
          const message = `Your request has been accepted by ${req.user.username}. Contact them at +91${req.user.phoneNumber}.`;
          await sendSMS(requester.phoneNumber, message);
        }

        // Fetch previous responses and requests
        const previousResponses = await Notification.find({
          requestId: notification.requestId,
          status: { $ne: "pending" }, // Exclude pending notifications
        });

        // Return success response with all previous responses and requests
        res.status(200).json({
          message: "Response recorded",
          previousResponses,
          originalRequest,
        });
      }
    } else if (response === "decline") {
      // Decline the request for all users
      const notificationsToUpdate = await Notification.find({
        requestId: notification.requestId,
      });

      // Update all related notifications to "declined"
      for (const notif of notificationsToUpdate) {
        notif.status = "declined";
        await notif.save();
      }

      // Fetch previous responses and requests
      const previousResponses = await Notification.find({
        requestId: notification.requestId,
        status: { $ne: "pending" }, // Exclude pending notifications
      });

      // Fetch the original request
      const originalRequest = await Request.findById(notification.requestId);

      // Return success response with all previous responses and requests
      res.status(200).json({
        message: "Response recorded",
        previousResponses,
        originalRequest,
      });
    } else {
      return res.status(400).json({ error: "Invalid response type" });
    }
  } catch (error) {
    console.error("Error responding to notification:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Function to send SMS using Twilio
const sendSMS = async (phoneNumber, message) => {
  try {
    const formattedPhoneNumber = `+91${phoneNumber}`;
    await twilioClient.messages.create({
      body: message,
      from: "+17623202044",
      to: formattedPhoneNumber,
    });
    console.log(
      `SMS notification sent successfully to ${formattedPhoneNumber}`
    );
  } catch (error) {
    console.error("Error sending SMS:", error);
  }
};

const notifyUsersInRadius = async (request, excludeUserId) => {
  const radiusInMeters = 600 * 4046.86; // Convert 600 acres to meters (1 acre = 1609.34 meters)
  const users = await User.find({
    location: {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: request.location.coordinates,
        },
        $maxDistance: radiusInMeters,
      },
    },
    _id: { $ne: excludeUserId }, // Exclude the user who created the request
  });

  if (!users.length) {
    console.log("No users found within the specified radius.");
    return 0; // Return 0 if no users are found
  }

  for (const user of users) {
    const notification = new Notification({
      userId: user._id,
      requestId: request._id,
      status: "pending",
    });

    await notification.save();

    // Send SMS to each notified user
    if (user.phoneNumber) {
      const formattedPhoneNumber = `+91${user.phoneNumber}`;
      const notificationMessage = `New request: ${request.type} - ${request.message}. Please respond.`;
      await twilioClient.messages.create({
        body: notificationMessage,
        from: "+17623202044",
        to: formattedPhoneNumber,
      });
    }
  }

  return users.length;
};

// Function to calculate distance between two points
const getDistance = ([lat1, lon1], [lat2, lon2]) => {
  const R = 6371; // Radius of Earth in kilometers
  const toRad = (value) => (value * Math.PI) / 180;
  const φ1 = toRad(lat1);
  const φ2 = toRad(lat2);
  const Δφ = toRad(lat2 - lat1);
  const Δλ = toRad(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;
  console.log(`Calculated distance: ${distance} kilometers`);
  return distance;
};

module.exports = router;
