const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const router = express.Router();
const secret = "123123";

// Registration route
router.post("/register", async (req, res) => {
  console.log("Registration endpoint hit");

  const { username, email, password, phoneNumber, location } = req.body; // Add phoneNumber

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    console.log("User already exists");
    return res.status(400).send("User already exists.");
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const user = new User({
    username,
    email,
    password: hashedPassword,
    phoneNumber, // Save phoneNumber
    location,
  });

  try {
    const savedUser = await user.save();
    console.log("User saved successfully", savedUser);
    res.send(savedUser);
  } catch (err) {
    console.error("Error saving user:", err.message);
    res.status(500).send(err.message);
  }
});

// Login route
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send("User not found");
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).send("Invalid credentials");
    }

    const token = jwt.sign({ id: user._id }, secret, { expiresIn: "1h" });
    res.json({ token, userId: user._id });
  } catch (error) {
    console.error("Error during login:", error);
    res.status(500).send("Internal Server Error");
  }
});

module.exports = router;
