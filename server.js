require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;
const MONGO_URI = process.env.MONGO_URI;

// Connect to MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.log('MongoDB Error:', err);
    process.exit(1);
  });

// Property Model
const propertySchema = new mongoose.Schema({
  Name: String,
  PropertyTitle: String,
  Price: String,
  Location: String,
  TotalArea: Number,
  Baths: Number,
});
const Property = mongoose.model('Property', propertySchema);
// User Model
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true }, // Hashed
  firstName: String,
  lastName: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
});
const User = mongoose.model('User', userSchema);
// Seed Route (Run Once) - USES YOUR JSON FILE
app.get('/seed', async (req, res) => {
  try {
    const filePath = path.join(__dirname, 'data', 'real_estate_data.json');
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Error: real_estate_data.json not found on server');
    }

    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);

    const docs = data.map(p => ({
      Name: p.Name,
      PropertyTitle: p['Property Title'],
      Price: p.Price,
      Location: p.Location,
      TotalArea: p.Total_Area,
      Baths: p.Baths,
    }));

    await Property.insertMany(docs, { ordered: false }); // Add, ignore duplicates

    res.send(`Data added to MongoDB from JSON file! Loaded ${docs.length} properties.`);
  } catch (err) {
    console.error('Seed error:', err);
    res.status(500).send('Seed Error: ' + err.message);
  }
});
// NEW: Review Model 
const reviewSchema = new mongoose.Schema({
  brokerName: { type: String, required: true }, // e.g., "Skyline Realty"
  rating: { type: Number, required: true, min: 1, max: 5 },
  feedback: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});
const Review = mongoose.model('Review', reviewSchema);
// API: Get All Products - FROM DB (like your original, but from MongoDB)
app.get('/api/products', async (req, res) => {
  try {
    const all = await Property.find().lean();
    if (all.length === 0) {
      return res.json({ data: [], message: 'No properties yet - run /seed' });
    }

    const transformed = all.map(p => ({
      Name: p.Name,
      PropertyTitle: p.PropertyTitle,
      Price: p.Price,
      Location: p.Location,
      TotalArea: p.TotalArea,
      Baths: p.Baths,
    }));

    res.json({ data: transformed });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, address, city, state, zip } = req.body;
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }
    const hashedPassword = await bcrypt.hash(password, 10); // Hash password
    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      phone,
      address,
      city,
      state,
      zip,
    });
    await user.save();
    res.json({ message: 'User created successfully', user: { ...user.toObject(), password: undefined } }); // Return without password
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid password' });
    }
    res.json({ message: 'Login successful', user: { ...user.toObject(), password: undefined } }); // Return without password
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// Update User 
app.put('/api/users', async (req, res) => {
  try {
    const { email, firstName, lastName, phone, address, city, state, zip } = req.body;
    const user = await User.findOneAndUpdate(
      { email },
      { firstName, lastName, phone, address, city, state, zip },
      { new: true }
    );
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ message: 'User updated successfully', user: { ...user.toObject(), password: undefined } });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
app.post('/api/reviews', async (req, res) => {
  try {
    const { brokerName, rating, feedback } = req.body;
    const review = new Review({
      brokerName,
      rating,
      feedback,
    });
    await review.save();
    res.json({ message: 'Review submitted successfully', review });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});

// NEW: Get Reviews for Broker (GET)
app.get('/api/reviews/:brokerName', async (req, res) => {
  try {
    const { brokerName } = req.params;
    const reviews = await Review.find({ brokerName }).sort({ createdAt: -1 }).lean();
    res.json({ data: reviews });
  } catch (err) {
    res.status(500).json({ message: 'Server error', details: err.message });
  }
});
// Test DB Connection
app.get('/test-db', async (req, res) => {
  try {
    const count = await Property.countDocuments();
    res.json({ connected: true, totalProperties: count });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Home
app.get('/', (req, res) => {
  res.send('Real Estate API is running!');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Go to http://localhost:${PORT}/seed to upload data (do this once)`);
});
