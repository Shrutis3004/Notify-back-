const mongoose = require("mongoose");

const requestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    type: String,
    message: String,
    image: String, // New field for the image
    location: {
      type: { type: String, default: "Point" },
      coordinates: [Number],
    },
    userPhone: String,
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // Automatically add `createdAt` field
  }
);

module.exports = mongoose.model("Request", requestSchema);
