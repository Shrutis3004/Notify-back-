const jwt = require("jsonwebtoken");
const User = require("../models/User"); // Import the User model
const secret = "123123";

module.exports = async (req, res, next) => {
  const authHeader = req.header("Authorization");
  console.log("Authorization Header:", authHeader); // Add this line

  if (!authHeader) {
    return res.status(401).send("Access denied. No token provided.");
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const verified = jwt.verify(token, secret);
    const userId = verified.id; // Get the userId from the token payload
    const user = await User.findById(userId).select("-password"); // Fetch the user data from the database
    if (!user) {
      return res.status(404).send("User not found");
    }
    req.user = user; // Populate the req.user object with the user's data
    next();
  } catch (err) {
    res.status(400).send("Invalid token");
  }
};
